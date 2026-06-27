export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parsePDF } from "@/lib/rag/parser";
import { chunkDocument, stripMetadata } from "@/lib/rag/chunk";
import { generateEmbedding, generateEmbeddingsBatch } from "@/lib/rag/embedding";
import { buildQuestionIndex } from "@/lib/rag/documentIndexer";
import { getAIProvider } from "@/lib/rag/aiProvider";

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { storagePath, documentId } = body;

    if (!storagePath) {
      return NextResponse.json(
        { error: "Missing storagePath in request body" },
        { status: 400 }
      );
    }

    if (!documentId) {
      return NextResponse.json(
        { error: "Missing documentId in request body" },
        { status: 400 }
      );
    }

    // Forward the authorization token from the request headers
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

    const supabaseClient = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
      auth: {
        persistSession: false,
      }
    });

    console.log(`[RAG Pipeline] Downloading file: documents/${storagePath}`);

    const { data: fileData, error: downloadError } = await supabaseClient.storage
      .from("documents")
      .download(storagePath);

    if (downloadError) {
      console.error("[RAG Pipeline] Supabase storage download error:", downloadError);
      return NextResponse.json(
        { error: `Failed to download file from storage: ${downloadError.message}` },
        { status: 500 }
      );
    }

    if (!fileData) {
      return NextResponse.json(
        { error: "Downloaded file data is empty" },
        { status: 500 }
      );
    }

    const arrayBuffer = await fileData.arrayBuffer();

    console.log(`[RAG Pipeline] Parsing PDF`);
    const parseResult = await parsePDF(arrayBuffer);

    // Look up the document ID in the database using the authenticated client
    const { data: docData, error: docError } = await supabaseClient
      .from("documents")
      .select("id, user_id, file_name")
      .eq("id", documentId)
      .single();

    if (docError || !docData) {
      console.error("[RAG Pipeline] Document lookup error:", docError);
      return NextResponse.json(
        { error: `Document record not found: ${docError?.message || "Unknown error"}` },
        { status: 404 }
      );
    }

    console.log("Processing document_id:", docData.id);

    const pageTexts = parseResult.pageTexts;
    const fileName = docData.file_name;
    const provider = getAIProvider();

    // Build LLM question index for this document
    console.log("[Indexer] Building question index for:", fileName);
    const questionIndex = await buildQuestionIndex(
      pageTexts, 
      provider, 
      documentId, 
      fileName
    );
    
    if (questionIndex.length > 0) {
      // Delete old index for this document first (for reindex case)
      await supabaseClient
        .from("question_index")
        .delete()
        .eq("document_id", documentId);
      
      // Insert new index
      const { error: indexError } = await supabaseClient
        .from("question_index")
        .insert(questionIndex);
      
      if (indexError) {
        console.warn("[Indexer] Failed to save question index:", indexError);
      } else {
        console.log(`[Indexer] Saved ${questionIndex.length} entries to question_index`);
      }
    }

    // Split parsed text into semantic chunks
    console.log(`[RAG Pipeline] Chunking document: ${docData.id}`);
    const chunks = chunkDocument(parseResult.pageTexts, docData.file_name);

    // Batch generate embeddings for all chunks in-memory
    const contentsToEmbed = chunks.map(chunk => stripMetadata(chunk.content));
    console.log(`[RAG Pipeline] Generating embeddings for ${chunks.length} chunks in a single batch...`);
    
    let embeddings: number[][] = [];
    try {
      embeddings = await generateEmbeddingsBatch(contentsToEmbed);
    } catch (embedError) {
      console.error("[RAG Pipeline] Batch embedding generation failed. Falling back to individual generation...", embedError);
      // Fallback: generate individually
      embeddings = [];
      for (const text of contentsToEmbed) {
        try {
          const emb = await generateEmbedding(text);
          embeddings.push(emb);
        } catch (e) {
          console.error("[RAG Pipeline] Fallback embedding generation failed:", e);
          embeddings.push([]);
        }
      }
    }

    // Sanitize embeddings — NaN/Infinity are not valid JSON and cause
    // "invalid input syntax for type json" errors in Postgres
    const sanitizeEmbedding = (emb: number[]): number[] =>
      emb.map((v) => (Number.isFinite(v) ? v : 0));

    // Persist new chunks populated with their embedding directly in a single query
    const chunksToInsert = chunks.map((chunk, index) => ({
      document_id: docData.id,
      user_id: docData.user_id,
      page_number: chunk.pageNumber,
      chunk_index: chunk.chunkIndex,
      content: chunk.content,
      embedding:
        embeddings[index] && embeddings[index].length > 0
          ? sanitizeEmbedding(embeddings[index])
          : null,
      created_at: new Date().toISOString(),
    }));

    console.log(`[RAG Pipeline] Storing ${chunksToInsert.length} chunks with embeddings in batches...`);

    // Insert in batches of 50 to avoid request payload size limits
    const INSERT_BATCH_SIZE = 50;
    for (let offset = 0; offset < chunksToInsert.length; offset += INSERT_BATCH_SIZE) {
      const batch = chunksToInsert.slice(offset, offset + INSERT_BATCH_SIZE);
      const { error: insertError } = await supabaseClient
        .from("chunks")
        .insert(batch);

      if (insertError) {
        console.error("[RAG Pipeline] Error persisting chunks batch:", insertError);
        return NextResponse.json(
          { error: `Failed to persist chunks: ${insertError.message}` },
          { status: 500 }
        );
      }
    }


    console.log("Chunk count inserted:", chunksToInsert.length);
    const successCount = embeddings.filter(emb => emb && emb.length > 0).length;

    const endTime = Date.now();
    const totalTimeMs = endTime - startTime;

    // Log metrics
    console.log("=== [RAG PIPELINE COMPLETE METRICS] ===");
    console.log(`- File Name: ${docData.file_name || "Unknown"}`);
    console.log(`- Total Pages: ${parseResult.pages}`);
    console.log(`- Total Chunks: ${chunks.length}`);
    console.log(`- Embeddings Generated: ${successCount}/${chunks.length}`);
    console.log(`- Total Pipeline Execution Time: ${totalTimeMs}ms`);
    console.log("======================================================");

    return NextResponse.json({
      success: true,
      pages: parseResult.pages,
      chunks: chunks.length,
      embeddingsGenerated: successCount,
      totalTimeMs,
    });

  } catch (err) {
    console.error("[RAG Pipeline] Unhandled extraction error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "An unhandled error occurred during document parsing" },
      { status: 500 }
    );
  }
}
