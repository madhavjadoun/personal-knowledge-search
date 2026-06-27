import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { retrieveChunks } from "@/lib/retrievalEngine";
import { RetrievalError } from "@/lib/retrievalEngine/types";
import { generateAnswer } from "@/lib/answerEngine";
import { AnswerEngineError } from "@/lib/answerEngine/providers";
import { PromptChunk, RetrievalMeta } from "@/lib/answerEngine/types";
import { RetrievedChunk } from "@/lib/retrievalEngine/types";

export const runtime = "nodejs";

/**
 * POST /api/answer
 *
 * Full RAG pipeline:
 *   1. Retrieve relevant chunks for the query (via retrieveChunks).
 *   2. Build a grounded prompt from those chunks (via buildPrompt, called internally).
 *   3. Generate an answer from the LLM (via generateAnswer → Ollama).
 *   4. Return the answer + all pipeline metadata.
 *
 * Request body:
 *   query              string   required — the user's question
 *   topK               number   optional — how many chunks to retrieve (default 5, max 20)
 *   similarityThreshold number  optional — minimum cosine similarity (default 0.3)
 *   filterDocumentId   string   optional — restrict retrieval to one document
 *
 * Response body (success):
 *   {
 *     success: true,
 *     answer: string,
 *     provider: string,
 *     model: string,
 *     generationTimeMs: number,
 *     promptMetrics: { promptCharacters, tokenEstimate, contextCharacters, chunksIncluded },
 *     retrieval: { provider, model, returnedChunks, averageSimilarity, totalTimeMs }
 *   }
 */
export async function POST(request: Request) {
  try {
    // ── Parse request ───────────────────────────────────────────────────────
    const body = await request.json().catch(() => ({}));
    const {
      query,
      topK = 5,
      similarityThreshold = 0.3,
      filterDocumentId,
    } = body;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return NextResponse.json(
        { code: "EMPTY_QUERY", message: "Missing or invalid query field." },
        { status: 400 }
      );
    }

    const clampedTopK = Math.min(Math.max(Number(topK) || 5, 1), 20);
    const clampedThreshold = Math.min(Math.max(Number(similarityThreshold) || 0.3, 0), 1);

    // ── Build authenticated Supabase client (passes caller JWT for RLS) ─────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      auth: { persistSession: false },
    });

    // ── Step 1: Retrieve relevant chunks ────────────────────────────────────
    const retrieval = await retrieveChunks(supabase, query, {
      topK: clampedTopK,
      similarityThreshold: clampedThreshold,
      filterDocumentId: filterDocumentId || undefined,
    });

    // ── Step 2 & 3: Build prompt + Generate answer ──────────────────────────
    // Map RetrievedChunk → PromptChunk (compatible shapes, explicit cast for safety)
    const promptChunks: PromptChunk[] = retrieval.results.map((c: RetrievedChunk) => ({
      chunkId: c.chunkId,
      documentId: c.documentId,
      pageStart: c.pageStart,
      pageEnd: c.pageEnd,
      chunkIndex: c.chunkIndex,
      similarityScore: c.similarityScore,
      fullText: c.fullText,
    }));

    const retrievalMeta: RetrievalMeta = {
      provider: retrieval.provider,
      model: retrieval.model,
      embeddingTimeMs: retrieval.embeddingTimeMs,
      searchTimeMs: retrieval.searchTimeMs,
      totalTimeMs: retrieval.totalTimeMs,
      returnedChunks: retrieval.returnedChunks,
      averageSimilarity: retrieval.averageSimilarity,
    };

    const result = await generateAnswer(query, promptChunks, retrievalMeta);

    // ── Return structured response ───────────────────────────────────────────
    return NextResponse.json({
      success: true,
      answer: result.answer,
      provider: result.provider,
      model: result.model,
      generationTimeMs: result.generationTimeMs,
      promptMetrics: result.promptMetrics,
      retrieval: {
        provider: retrieval.provider,
        model: retrieval.model,
        returnedChunks: retrieval.returnedChunks,
        averageSimilarity: retrieval.averageSimilarity,
        confidence: result.confidence ?? retrieval.confidence,
        totalTimeMs: retrieval.totalTimeMs,
      },
      // Per-chunk detail for the UI (no fullText to keep payload lean)
      chunks: retrieval.results.map((c) => ({
        chunkId: c.chunkId,
        documentId: c.documentId,
        pageStart: c.pageStart,
        pageEnd: c.pageEnd,
        similarityScore: c.similarityScore,
        confidence: c.confidence,
        preview: c.preview,
      })),
    });

  } catch (err) {
    // ── Typed retrieval errors ───────────────────────────────────────────────
    if (err && typeof err === "object" && "code" in err) {
      const typedErr = err as RetrievalError | AnswerEngineError;

      const statusMap: Record<string, number> = {
        // Retrieval errors
        EMPTY_QUERY: 400,
        QUERY_TOO_LONG: 400,
        PROVIDER_UNAVAILABLE: 503,
        EMBEDDING_FAILED: 502,
        NO_EMBEDDINGS_FOUND: 404,
        DOCUMENT_NOT_EMBEDDED: 404,
        NO_MATCHING_CHUNKS: 404,
        OUT_OF_DOMAIN: 404,
        SEARCH_FAILED: 500,
        // Answer engine errors
        LLM_UNAVAILABLE: 503,
        GENERATION_FAILED: 502,
        EMPTY_RESPONSE: 502,
        INVALID_RESPONSE: 502,
      };

      const status = statusMap[typedErr.code] ?? 500;
      return NextResponse.json(
        { code: typedErr.code, message: typedErr.message },
        { status }
      );
    }

    console.error("[Answer API] Unexpected error:", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ code: "GENERATION_FAILED", message: msg }, { status: 500 });
  }
}
