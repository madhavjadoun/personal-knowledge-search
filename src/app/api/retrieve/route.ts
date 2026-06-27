import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { retrieveChunks } from "@/lib/retrievalEngine";
import { RetrievalError } from "@/lib/retrievalEngine/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // ── Dev guard (this route is unrestricted; keep it accessible in prod for future chat feature)
  // Remove if you want to restrict to development only.

  try {
    const body = await request.json().catch(() => ({}));
    const {
      query,
      topK = 5,
      similarityThreshold = 0.3,
      filterDocumentId,
    } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { code: "EMPTY_QUERY", message: "Missing or invalid query field." },
        { status: 400 }
      );
    }

    const clampedTopK = Math.min(Math.max(Number(topK) || 5, 1), 20);
    const clampedThreshold = Math.min(Math.max(Number(similarityThreshold) || 0.3, 0), 1);

    // ── Supabase client with caller's JWT so RLS works ──────────────────────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      auth: { persistSession: false },
    });

    const result = await retrieveChunks(supabase, query, {
      topK: clampedTopK,
      similarityThreshold: clampedThreshold,
      filterDocumentId: filterDocumentId || undefined,
    });

    return NextResponse.json({ success: true, ...result });

  } catch (err) {
    // Typed retrieval errors
    if (err && typeof err === "object" && "code" in err) {
      const typedErr = err as RetrievalError;
      const statusMap: Record<string, number> = {
        EMPTY_QUERY: 400,
        QUERY_TOO_LONG: 400,
        PROVIDER_UNAVAILABLE: 503,
        EMBEDDING_FAILED: 502,
        NO_EMBEDDINGS_FOUND: 404,
        DOCUMENT_NOT_EMBEDDED: 404,
        NO_MATCHING_CHUNKS: 200, // not an error, just no results
        SEARCH_FAILED: 500,
      };
      const status = statusMap[typedErr.code] ?? 500;
      return NextResponse.json({ code: typedErr.code, message: typedErr.message }, { status });
    }

    console.error("[Retrieval API] Unexpected error:", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ code: "SEARCH_FAILED", message: msg }, { status: 500 });
  }
}
