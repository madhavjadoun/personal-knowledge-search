import { SupabaseClient } from "@supabase/supabase-js";
import { generateEmbedding } from "./embedding";

export interface SearchResult {
  id: string;
  document_id: string;
  page_number: number;
  chunk_index: number;
  content: string;
  similarity: number;
}

export interface SearchOptions {
  documentId?: string;
  threshold?: number;
  limit?: number;
}

/**
 * Performs semantic similarity search using pgvector on Supabase.
 * Generates an embedding for the question and calls the `match_chunks` RPC.
 */
export async function vectorSearch(
  supabaseClient: SupabaseClient,
  question: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const { documentId, threshold = 0.5, limit = 5 } = options;

  // 1. Generate embedding vector for the search query
  console.log(`[RAG Search] Generating embedding for question: "${question}"`);
  const queryEmbedding = await generateEmbedding(question);

  // 2. Perform the database similarity search calling PostgreSQL RPC
  console.log(`[RAG Search] Querying match_chunks. document_id filter: ${documentId || "none"}`);
  const { data, error } = await supabaseClient.rpc("match_chunks", {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: limit,
    filter_document_id: documentId || null,
  });

  if (error) {
    console.error("[RAG Search] RPC match_chunks failed:", error);
    throw new Error(`Similarity search failed: ${error.message}`);
  }

  return (data || []) as SearchResult[];
}
