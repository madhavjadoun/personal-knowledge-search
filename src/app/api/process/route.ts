export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processDocument } from "@/lib/documentProcessor";

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const body = await request.json().catch(() => ({}));
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

    console.log(`[Process Route] Downloading file: documents/${storagePath}`);

    const { data: fileData, error: downloadError } = await supabaseClient.storage
      .from("documents")
      .download(storagePath);

    if (downloadError) {
      console.error("[Process Route] Supabase storage download error:", downloadError);
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

    // Call document processing layer
    const result = await processDocument(arrayBuffer);

    const totalTimeMs = Date.now() - startTime;
    console.log(`[Process Route] Ingested document ${documentId} with ${result.totalPages} pages in ${totalTimeMs}ms`);

    return NextResponse.json({
      success: true,
      totalPages: result.totalPages,
      totalCharacters: result.totalCharacters,
      pages: result.pages,
    });

  } catch (err) {
    console.error("[Process Route] Document parsing pipeline error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "An unhandled error occurred during document parsing" },
      { status: 500 }
    );
  }
}
