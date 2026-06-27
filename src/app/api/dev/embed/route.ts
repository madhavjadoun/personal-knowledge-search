import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processEmbeddingPipeline } from "@/lib/embeddingPipeline";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // Enforce development environment restriction
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "Forbidden: Developer utilities are restricted to development environment only." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { documentId, chunks, forceRegenerate } = body;

    if (!documentId) {
      return NextResponse.json({ error: "Missing documentId" }, { status: 400 });
    }

    if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
      return NextResponse.json({ error: "Missing or empty chunks list" }, { status: 400 });
    }

    // Set up Supabase Client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
    
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

    const results = await processEmbeddingPipeline(
      supabase,
      documentId,
      chunks,
      !!forceRegenerate
    );

    return NextResponse.json({
      success: true,
      results,
    });

  } catch (err) {
    console.error("[Dev Embed API] Pipeline error:", err);
    const msg = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
