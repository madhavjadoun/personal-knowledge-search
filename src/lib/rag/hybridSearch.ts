import { SupabaseClient } from "@supabase/supabase-js";
import { vectorSearch } from "./search";
import { extractQuestionNumber } from "./queryNormalizer";
import { classifyIntent } from "./intentClassifier";

export interface HybridCandidate {
  id: string;
  document_id: string;
  page_number: number;
  chunk_index: number;
  content: string;
  similarity: number;
  keywordScore: number;
  combinedScore: number;
}

/**
 * Performs search combining metadata lookup bypass for question numbers
 * and single vector search + keyword boosting for everything else.
 * 
 * No multi-query. No intent dependency for metadata bypass. One embedding call max.
 */
export async function hybridSearch(
  supabaseClient: SupabaseClient,
  query: string,
  documentId?: string
): Promise<HybridCandidate[]> {
  // For LIST queries on large documents, fetch all chunks sorted by page/chunk order
  const intent = classifyIntent(query);
  if (intent === "LIST" || intent === "COUNT") {
    let listQuery = supabaseClient
      .from("chunks")
      .select("id, document_id, page_number, chunk_index, content")
      .order("page_number", { ascending: true })
      .order("chunk_index", { ascending: true });
    if (documentId) {
      listQuery = listQuery.eq("document_id", documentId);
    }
    const { data: allChunks, error } = await listQuery.limit(2000);
    if (!error && allChunks && allChunks.length > 0) {
      console.log(`[RAG Search] LIST/COUNT mode: fetched ${allChunks.length} chunks in document order.`);
      return allChunks.map((c) => ({
        id: c.id,
        document_id: c.document_id,
        page_number: c.page_number,
        chunk_index: c.chunk_index,
        content: c.content,
        similarity: 1.0,
        keywordScore: 1.0,
        combinedScore: 1.0,
      }));
    }
  }

  // 1. Check for question number — bypass vector search entirely if found
  const qNumber = extractQuestionNumber(query);

  if (qNumber) {
    console.log(`[RAG Search] Question number ${qNumber} detected. Attempting direct metadata lookup.`);
    
    let metaQuery = supabaseClient
      .from("chunks")
      .select("id, document_id, page_number, chunk_index, content")
      .ilike("content", `%question_number: ${qNumber}%`);

    if (documentId) {
      metaQuery = metaQuery.eq("document_id", documentId);
    }

    const { data: matchedChunks, error } = await metaQuery.limit(10);
    if (!error && matchedChunks && matchedChunks.length > 0) {
      console.log(`[RAG Search] Metadata match found: ${matchedChunks.length} chunks for Question ${qNumber}.`);
      return matchedChunks.map((c) => ({
        id: c.id,
        document_id: c.document_id,
        page_number: c.page_number,
        chunk_index: c.chunk_index,
        content: c.content,
        similarity: 1.0,
        keywordScore: 1.0,
        combinedScore: 1.0,
      }));
    }
    // If metadata match fails, fall through to vector search
    console.log(`[RAG Search] No metadata match for Question ${qNumber}. Falling back to vector search.`);
  }

  // 2. Single vector search (one embedding call)
  const candidateMap = new Map<string, HybridCandidate>();

  console.log(`[RAG Search] Running single vector search for: "${query}"`);
  try {
    const results = await vectorSearch(supabaseClient, query, {
      documentId,
      threshold: 0.5,
      limit: 20,
    });

    for (const res of results) {
      candidateMap.set(res.id, {
        id: res.id,
        document_id: res.document_id,
        page_number: res.page_number,
        chunk_index: res.chunk_index,
        content: res.content,
        similarity: res.similarity,
        keywordScore: 0,
        combinedScore: 0,
      });
    }
  } catch (err) {
    console.warn(`[RAG Search] Vector search failed:`, err);
  }

  // 3. Keyword matching to supplement vector results
  const keywords = extractKeywords(query);
  if (keywords.length > 0) {
    const tsQuery = keywords.join(' | ');
    let kwQuery = supabaseClient
      .from("chunks")
      .select("id, document_id, page_number, chunk_index, content")
      .textSearch("content_tsv", tsQuery, { type: "websearch", config: "english" });
    if (documentId) {
      kwQuery = kwQuery.eq("document_id", documentId);
    }
    const { data: keywordChunks, error } = await kwQuery.limit(30);

    if (!error && keywordChunks) {
      for (const kc of keywordChunks) {
        const keywordScore = getKeywordOverlapScore(kc.content, keywords);
        const existing = candidateMap.get(kc.id);
        if (existing) {
          existing.keywordScore = keywordScore;
        } else {
          const estimatedSim = 0.2 + keywordScore * 0.3;
          candidateMap.set(kc.id, {
            id: kc.id,
            document_id: kc.document_id,
            page_number: kc.page_number,
            chunk_index: kc.chunk_index,
            content: kc.content,
            similarity: estimatedSim,
            keywordScore,
            combinedScore: 0,
          });
        }
      }
    }
  }

  // 4. Combined score: 70% semantic + 30% keyword
  const candidates = Array.from(candidateMap.values());
  for (const c of candidates) {
    if (c.keywordScore === 0) {
      c.keywordScore = getKeywordOverlapScore(c.content, keywords);
    }
    c.combinedScore = 0.7 * c.similarity + 0.3 * c.keywordScore;
  }

  // Sort by combined score descending with stable fallback tie-breakers
  candidates.sort((a, b) => {
    if (b.combinedScore !== a.combinedScore) return b.combinedScore - a.combinedScore;
    if (a.page_number !== b.page_number) return a.page_number - b.page_number;
    if (a.chunk_index !== b.chunk_index) return a.chunk_index - b.chunk_index;
    return a.id.localeCompare(b.id);
  });
  return candidates;
}

/**
 * Extracts distinct alphabetic keywords of length >= 3 from a query.
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "what", "which", "where", "when", "this", "that", "these", "those",
    "with", "from", "into", "about", "your", "their", "there", "here",
    "them", "then", "than", "list", "show", "find", "questions", "question",
    "explain", "summarize", "page", "contains", "problems", "topics", "give"
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w));
}

/**
 * Calculates keyword overlap ratio.
 */
function getKeywordOverlapScore(content: string, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  const lowerContent = content.toLowerCase();
  let matches = 0;
  for (const kw of keywords) {
    if (lowerContent.includes(kw)) {
      matches++;
    }
  }
  return matches / keywords.length;
}
