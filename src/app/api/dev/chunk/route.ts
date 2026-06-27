import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processDocument } from "@/lib/documentProcessor";
import { chunkDocument } from "@/lib/chunkingEngine";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // Developer endpoints must be visible/accessible only in development mode
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "Forbidden: Developer utilities are restricted to development environment only." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { documentId, maxChunkCharacters, overlapCharacters } = body;

    if (!documentId) {
      return NextResponse.json({ error: "Missing documentId" }, { status: 400 });
    }

    const maxChars = Number(maxChunkCharacters) || 500;
    const overlapChars = Number(overlapCharacters) || 50;

    if (maxChars <= 0) {
      return NextResponse.json({ error: "maxChunkCharacters must be positive" }, { status: 400 });
    }
    if (overlapChars < 0 || overlapChars >= maxChars) {
      return NextResponse.json(
        { error: "overlapCharacters must be non-negative and less than maxChunkCharacters" },
        { status: 400 }
      );
    }

    // Initialize Supabase admin/service client or standard client to download the PDF
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
    
    // Get authorization token from request (if any)
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
      auth: {
        persistSession: false,
      }
    });

    // 1. Fetch document record to get file path
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (docError || !doc) {
      console.error("[Dev Chunk API] Document query error:", docError);
      return NextResponse.json(
        { error: `Document not found in database: ${docError?.message || "Unknown error"}` },
        { status: 404 }
      );
    }

    // 2. Reconstruct user-scoped storage path: {user_id}/{file_name}
    const storagePath = `${doc.user_id}/${doc.file_name}`;
    console.log(`[Dev Chunk API] Downloading PDF for parsing: documents/${storagePath}`);

    // 3. Download from Supabase storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("documents")
      .download(storagePath);

    if (downloadError || !fileData) {
      console.error("[Dev Chunk API] Download error:", downloadError);
      return NextResponse.json(
        { error: `Failed to download file from Supabase storage: ${downloadError?.message || "File empty"}` },
        { status: 500 }
      );
    }

    const arrayBuffer = await fileData.arrayBuffer();

    // 4. Parse the document (once)
    const parsedDoc = await processDocument(arrayBuffer);

    // 5. Chunk the parsed text (once)
    const chunkingResult = chunkDocument(parsedDoc, documentId, {
      maxChunkCharacters: maxChars,
      overlapCharacters: overlapChars,
    });

    // 6. Return combined payload
    return NextResponse.json({
      success: true,
      documentInfo: {
        id: doc.id,
        title: doc.title,
        file_name: doc.file_name,
        totalPages: parsedDoc.totalPages,
        totalCharacters: parsedDoc.totalCharacters,
      },
      pages: parsedDoc.pages,
      chunks: chunkingResult,
    });

  } catch (err) {
    console.error("[Dev Chunk API] Unexpected pipeline error:", err);
    const msg = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
