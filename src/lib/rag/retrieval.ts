import { SupabaseClient } from "@supabase/supabase-js";
import { getAIProvider } from "./aiProvider";
import { normalizeQuery } from "./queryNormalizer";
import { classifyIntent, Intent } from "./intentClassifier";
import { hybridSearch } from "./hybridSearch";
import { buildContext } from "./contextBuilder";
import { generateFinalAnswer } from "./responseGenerator";
import { rerankCandidates } from "./reranker";
import { extractKeywords } from "./adaptiveRetrieval";
import { expandQueryAndRewrites } from "./queryExpansion";

export interface RetrievalResponse {
  success: boolean;
  answer: string;
  sources: {
    page_number: number;
    similarity: number;
    content: string;
  }[];
  provider: string;
  intent: Intent;
  metrics: {
    totalChunks: number;
    retrievedChunksCount: number;
    removedDuplicatesCount: number;
    mergedChunksCount: number;
    finalContextTokens: number;
    geminiInputTokens: number;
    executionTimeMs: number;
  };
}

/**
 * Orchestrates the RAG retrieval and answer generation pipeline.
 * 
 * Simplified pipeline:
 * 1. Normalize query (deterministic)
 * 2. Classify intent (deterministic heuristics, no LLM)
 * 3. Search (metadata bypass for question numbers, single vector search otherwise)
 * 4. Build context (deduplicate, TopK, merge)
 * 5. Generate answer (single LLM call)
 */
export async function retrieveAndGenerate(
  supabaseClient: SupabaseClient,
  question: string,
  documentId?: string
): Promise<RetrievalResponse> {
  const startTime = Date.now();

  const provider = getAIProvider();

  // 1. Get total chunks count for diagnostic log metrics
  let totalChunks = 0;
  try {
    const countQuery = supabaseClient
      .from("chunks")
      .select("*", { count: "exact", head: true });
    if (documentId) {
      countQuery.eq("document_id", documentId);
    }
    const { count } = await countQuery;
    totalChunks = count || 0;
  } catch (countErr) {
    console.warn("[RAG Search Pipeline] Failed to query total chunks count:", countErr);
  }

  // 2. Query Preprocessing (Normalization — deterministic)
  const normalizedQuery = normalizeQuery(question);

  // 3. Intent Classification (deterministic heuristics — no LLM call)
  const intent = classifyIntent(normalizedQuery);

  if (intent === "COUNT" || intent === "LIST") {
    // Try to answer directly from question_index — no vector search needed
    let indexQuery = supabaseClient
      .from("question_index")
      .select("number, title, style, approximate_page")
      .order("approximate_page", { ascending: true });
    
    if (documentId) {
      indexQuery = indexQuery.eq("document_id", documentId);
    }
    
    const { data: indexEntries, error: indexError } = await indexQuery;
    
    if (!indexError && indexEntries && indexEntries.length > 0) {
      console.log(`[RAG] Answering ${intent} from question_index: ${indexEntries.length} entries`);
      
      const indexText = indexEntries
        .map((e, i) => `${i + 1}. [${e.style}] #${e.number}: ${e.title} (page ~${e.approximate_page})`)
        .join("\n");
      
      const indexPrompt = intent === "COUNT"
        ? `The document contains exactly ${indexEntries.length} questions/sections:\n\n${indexText}\n\nQuestion: ${question}`
        : `Here are all ${indexEntries.length} questions/sections in the document:\n\n${indexText}\n\nQuestion: ${question}`;
      
      const systemMsg = intent === "COUNT"
        ? "You are an AI assistant. Answer the count question using the provided index. State the exact number clearly."
        : "You are an AI assistant. List all items from the provided index. Do not skip any. Number them 1 to N.";
      
      const { text: answer, promptTokens } = await provider.generateText(indexPrompt, systemMsg);
      
      const endTime = Date.now();
      return {
        success: true,
        answer,
        sources: [],
        provider: provider.name,
        intent,
        metrics: {
          totalChunks, retrievedChunksCount: 0,
          removedDuplicatesCount: 0, mergedChunksCount: 0,
          finalContextTokens: Math.ceil(indexText.length / 4.2),
          geminiInputTokens: promptTokens,
          executionTimeMs: endTime - startTime,
        },
      };
    }
    // If question_index is empty (old document not reindexed), fall through to normal search
    console.log("[RAG] question_index empty, falling back to vector search");
  }

  const searchQuery = normalizedQuery;

  // 4. Search (metadata bypass for question numbers, single vector search otherwise)
  const candidates = await hybridSearch(
    supabaseClient,
    searchQuery,
    documentId
  );

  const retrievedChunksCount = candidates.length;

  const keywords = extractKeywords(normalizedQuery);
  const reranked = rerankCandidates(candidates, normalizedQuery, keywords);

  // 5. Context Builder (Deduplication, dynamic Top-K, page sorting & text merging)
  const { finalChunks, contextText } = buildContext(reranked, intent);

  // Log retrieval audit information
  console.log(`[RAG Retrieval Audit]
Normalized Query: "${normalizedQuery}"
Intent: ${intent}
Top-K: ${finalChunks.length}
Similarity Threshold: 0.5
Retrieved Chunk IDs: [${finalChunks.map(c => c.id).join(", ")}]
Retrieved Pages: [${finalChunks.map(c => c.page_number).join(", ")}]
Similarity Scores: [${finalChunks.map(c => c.similarity.toFixed(4)).join(", ")}]
Final Context Size: ${contextText.length} characters`);

  // 6. Strict Context Answer Generation (single LLM call)
  const { text: answer, promptTokens: geminiInputTokens } = await generateFinalAnswer(
    question,
    contextText,
    intent,
    provider
  );

  const endTime = Date.now();
  const executionTimeMs = endTime - startTime;
  const finalContextTokens = Math.ceil(contextText.length / 4.2);

  // Calculate metrics
  const removedDuplicatesCount = Math.max(0, retrievedChunksCount - finalChunks.length);
  const mergedChunksCount = 0; // Page merges are done on text construction level

  const sources = finalChunks.map((c) => ({
    page_number: c.page_number,
    similarity: c.similarity,
    content: c.content,
  }));

  return {
    success: true,
    answer,
    sources,
    provider: provider.name,
    intent,
    metrics: {
      totalChunks,
      retrievedChunksCount,
      removedDuplicatesCount,
      mergedChunksCount,
      finalContextTokens,
      geminiInputTokens,
      executionTimeMs,
    },
  };
}
