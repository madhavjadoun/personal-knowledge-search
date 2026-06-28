import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateQuiz } from "@/lib/answerEngine";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { documentId } = body;

    if (!documentId) {
      return NextResponse.json(
        { error: "Missing documentId in request body" },
        { status: 400 }
      );
    }

    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      auth: { persistSession: false },
    });

    // Query chunks for this document
    console.log(`[Quiz API] Querying chunks for document: ${documentId}`);
    const { data: chunks, error: dbError } = await supabase
      .from("chunks")
      .select("page_number, content")
      .eq("document_id", documentId)
      .order("chunk_index", { ascending: true });

    if (dbError || !chunks || chunks.length === 0) {
      console.error("[Quiz API] Failed to fetch chunks from DB:", dbError);
      return NextResponse.json(
        { error: "Document has no processed chunks or failed to fetch. Please upload or process it first." },
        { status: 404 }
      );
    }

    // Call quiz generator
    const questions = await generateQuiz(chunks);

    return NextResponse.json({
      success: true,
      questions,
    });

  } catch (err) {
    console.error("[Quiz API] Generation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error during quiz generation" },
      { status: 500 }
    );
  }
}
