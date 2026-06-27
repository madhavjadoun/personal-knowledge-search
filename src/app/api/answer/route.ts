import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { retrieveChunks } from "@/lib/retrievalEngine";
import { RetrievalError } from "@/lib/retrievalEngine/types";
import { generateAnswer, GROUNDING_FAIL_MESSAGE } from "@/lib/answerEngine";
import { AnswerEngineError } from "@/lib/answerEngine/providers";
import { PromptChunk, RetrievalMeta } from "@/lib/answerEngine/types";
import { RetrievedChunk } from "@/lib/retrievalEngine/types";
import {
  getHistory,
  saveTurn,
  clearMemory,
  detectQueryType,
  resolveQueryReferences,
  isUnrelatedTopic,
} from "@/lib/conversationMemory/conversationMemory";
import { createLLMProvider } from "@/lib/answerEngine/providers";
import {
  detectDocumentQuery,
  formatIntelligenceResponse,
  generateLegacyIntelligence,
} from "@/lib/documentIntelligence";
import {
  splitQuery,
  classifyIntent,
  mergeResponses,
} from "@/lib/queryRouter";

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
      sessionId = "default",
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

    const llmProviderForRouter = createLLMProvider();

    // ── 1. Split Query into Intents ──────────────────────────────────────────
    const splitIntents = await splitQuery(query, llmProviderForRouter);

    if (splitIntents.length > 1) {
      console.log(`[QueryRouter] Mixed Query Detected: true`);
      console.log(`[QueryRouter] Intent Count: ${splitIntents.length}`);

      const intentClassifications = splitIntents.map((intent) => classifyIntent(intent));
      console.log(`[QueryRouter] Intent Types: ${intentClassifications.map((i) => i.type).join(", ")}`);
      console.log(`[QueryRouter] Routing Decisions: ${intentClassifications.map((i) => i.routedTarget).join(", ")}`);

      const responses: { query: string; answer: string; success: boolean }[] = [];
      const allSourcePages = new Set<number>();
      let totalContextChars = 0;
      let totalChunks = 0;
      let totalTime = 0;

      for (const intent of intentClassifications) {
        const startTime = Date.now();
        try {
          if (intent.routedTarget === "DOC_INTEL") {
            if (!filterDocumentId) {
              responses.push({
                query: intent.query,
                answer: "Please select a specific document first using the dropdown to request a document-level overview, summary, or topics.",
                success: true,
              });
              continue;
            }

            let intel;
            const { data: fileData, error: downloadError } = await supabase.storage
              .from("documents")
              .download(`intelligence/${filterDocumentId}.json`);

            if (downloadError || !fileData) {
              intel = await generateLegacyIntelligence(supabase, filterDocumentId);
            } else {
              const text = await fileData.text();
              intel = JSON.parse(text);

              // Self-healing check
              const isQuestionQuery = /\b(questions|question|how\s+many\s+questions)\b/i.test(intent.query);
              if (isQuestionQuery && (!intel.questions || intel.questions.isQuestionOriented === false)) {
                intel = await generateLegacyIntelligence(supabase, filterDocumentId);
              }
            }

            const ans = formatIntelligenceResponse(intent.query, intel);
            responses.push({ query: intent.query, answer: ans, success: true });
            totalContextChars += intel.stats?.characterCount || 0;
            totalChunks += intel.stats?.totalChunks || 0;
            totalTime += Date.now() - startTime;
          } else {
            // Semantic Retrieval Target
            let history = getHistory(sessionId);
            let queryToUse = intent.query;
            let queryType: "NEW_QUERY" | "FOLLOW_UP" = "NEW_QUERY";
            let followUpDetected = false;
            let rewrittenQuery = "";

            // Reset on Document Change
            const lastTurn = history[history.length - 1];
            if (lastTurn && filterDocumentId !== lastTurn.documentId) {
              clearMemory(sessionId);
              history = [];
            }

            queryType = detectQueryType(intent.query);
            if (queryType === "FOLLOW_UP" && history.length > 0) {
              followUpDetected = true;
              rewrittenQuery = await resolveQueryReferences(intent.query, history, llmProviderForRouter);
              queryToUse = rewrittenQuery;
            } else if (queryType === "NEW_QUERY" && history.length > 0) {
              const unrelated = await isUnrelatedTopic(intent.query, history, llmProviderForRouter);
              if (unrelated) {
                clearMemory(sessionId);
                history = [];
              }
            }

            const retrieval = await retrieveChunks(supabase, queryToUse, {
              topK: clampedTopK,
              similarityThreshold: clampedThreshold,
              filterDocumentId: filterDocumentId || undefined,
            });

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

            const result = await generateAnswer(queryToUse, promptChunks, retrievalMeta, !!filterDocumentId);

            if (filterDocumentId && result.confidence === "Low") {
              result.answer = GROUNDING_FAIL_MESSAGE;
            }

            responses.push({ query: intent.query, answer: result.answer, success: true });

            const sourcePages = [
              ...new Set(
                retrieval.results.flatMap((c) => {
                  const pages: number[] = [];
                  for (let p = c.pageStart; p <= c.pageEnd; p++) pages.push(p);
                  return pages;
                })
              ),
            ];
            sourcePages.forEach((p) => allSourcePages.add(p));
            totalContextChars += promptChunks.reduce((acc, c) => acc + c.fullText.length, 0);
            totalChunks += promptChunks.length;
            totalTime += Date.now() - startTime;
          }
        } catch (err) {
          console.error(`[QueryRouter] Error running intent: "${intent.query}"`, err);
          responses.push({ query: intent.query, answer: "", success: false });
        }
      }

      const mergedAnswer = mergeResponses(responses);
      const sortedPages = [...allSourcePages].sort((a, b) => a - b);

      console.log(`[QueryRouter] Merge Completed: true`);

      // Save merged response to memory
      if (mergedAnswer) {
        saveTurn(sessionId, {
          userQuestion: query, // original multi-intent question
          finalAnswer: mergedAnswer,
          documentId: filterDocumentId || undefined,
          pageNumbers: sortedPages,
          timestamp: new Date().toISOString(),
        });
      }

      return NextResponse.json({
        success: true,
        answer: mergedAnswer,
        provider: "system",
        model: "mixed-query-router",
        generationTimeMs: totalTime,
        promptMetrics: {
          promptCharacters: query.length,
          tokenEstimate: Math.ceil(mergedAnswer.length / 4),
          contextCharacters: totalContextChars,
          chunksIncluded: totalChunks,
        },
        sourcePages: sortedPages,
        retrieval: {
          provider: "system",
          model: "mixed-query-router",
          returnedChunks: totalChunks,
          averageSimilarity: 1.0,
          confidence: "High",
          totalTimeMs: totalTime,
        },
        chunks: [],
      });
    }

    // ── 2. Fallback: Original Single-Intent Pipeline ──────────────────────────
    console.log(`[QueryRouter] Mixed Query Detected: false`);

    // ── Check if query is document-level (Document Intelligence routing) ─────
    const isDocQuery = detectDocumentQuery(query);
    if (isDocQuery) {
      console.log(`[Routing Decision] Document Intelligence`);

      if (!filterDocumentId) {
        return NextResponse.json({
          success: true,
          answer: "Please select a specific document first using the dropdown to request a document-level overview, summary, or topics.",
          provider: "system",
          model: "document-intelligence",
          generationTimeMs: 0,
          promptMetrics: { promptCharacters: 0, tokenEstimate: 0, contextCharacters: 0, chunksIncluded: 0 },
          sourcePages: [],
          retrieval: {
            provider: "system",
            model: "document-intelligence",
            returnedChunks: 0,
            averageSimilarity: 0,
            confidence: "High",
            totalTimeMs: 0,
          },
          chunks: [],
        });
      }

      let intel;
      try {
        const { data: fileData, error: downloadError } = await supabase.storage
          .from("documents")
          .download(`intelligence/${filterDocumentId}.json`);

        if (downloadError || !fileData) {
          intel = await generateLegacyIntelligence(supabase, filterDocumentId);
        } else {
          const text = await fileData.text();
          intel = JSON.parse(text);

          // Self-healing: If the query is about questions and the cached file says "Not Applicable",
          // trigger dynamic regeneration once to capture the new code-based regex metrics.
          const isQuestionQuery = /\b(questions|question|how\s+many\s+questions)\b/i.test(query);
          if (isQuestionQuery && (!intel.questions || intel.questions.isQuestionOriented === false)) {
            console.log(`[DocIntel] Cache self-healing triggered for doc: ${filterDocumentId}`);
            intel = await generateLegacyIntelligence(supabase, filterDocumentId);
          }
        }
      } catch (err) {
        console.warn("[Answer API] Failed to fetch pre-generated intelligence, running fallback:", err);
        try {
          intel = await generateLegacyIntelligence(supabase, filterDocumentId);
        } catch (fallbackErr) {
          console.error("[Answer API] Fallback document intelligence failed:", fallbackErr);
          return NextResponse.json(
            { code: "GENERATION_FAILED", message: "Failed to load document analysis." },
            { status: 500 }
          );
        }
      }

      const answer = formatIntelligenceResponse(query, intel);

      return NextResponse.json({
        success: true,
        answer,
        provider: "system",
        model: "document-intelligence",
        generationTimeMs: intel.metadata?.processingTimeMs || 0,
        promptMetrics: {
          promptCharacters: 0,
          tokenEstimate: 0,
          contextCharacters: intel.stats?.characterCount || 0,
          chunksIncluded: intel.stats?.totalChunks || 0,
        },
        sourcePages: [],
        retrieval: {
          provider: "system",
          model: "document-intelligence",
          returnedChunks: intel.stats?.totalChunks || 0,
          averageSimilarity: 1.0,
          confidence: "High",
          totalTimeMs: 0,
        },
        chunks: [],
      });
    } else {
      console.log(`[Routing Decision] Semantic Retrieval`);
    }

    // ── Setup Conversational Memory ─────────────────────────────────────────
    let history = getHistory(sessionId);
    let queryToUse = query;
    let queryType: "NEW_QUERY" | "FOLLOW_UP" = "NEW_QUERY";
    let followUpDetected = false;
    let rewrittenQuery = "";
    let memoryReset = false;
    let resetReason = "";

    // 1. Reset on Document Change
    const lastTurn = history[history.length - 1];
    if (lastTurn && filterDocumentId !== lastTurn.documentId) {
      clearMemory(sessionId);
      history = [];
      memoryReset = true;
      resetReason = "Document Changed";
    }

    // 2. Detect & Resolve Follow-up
    queryType = detectQueryType(query);
    if (queryType === "FOLLOW_UP" && history.length > 0) {
      followUpDetected = true;
      rewrittenQuery = await resolveQueryReferences(query, history, llmProviderForRouter);
      queryToUse = rewrittenQuery;
    } else if (queryType === "NEW_QUERY" && history.length > 0) {
      // 3. Reset on Unrelated Topic Change
      const unrelated = await isUnrelatedTopic(query, history, llmProviderForRouter);
      if (unrelated) {
        clearMemory(sessionId);
        history = [];
        memoryReset = true;
        resetReason = "Topic Changed";
      }
    }

    // ── Memory Logging ───────────────────────────────────────────────────────
    console.log(`[Memory] Memory Enabled      : true`);
    console.log(`[Memory] Query Type          : ${queryType}`);
    console.log(`[Memory] Follow-up Detected  : ${followUpDetected}`);
    if (followUpDetected) {
      console.log(`[Memory] Rewritten Query     : "${rewrittenQuery}"`);
    }
    console.log(`[Memory] Conversation Length : ${history.length}`);
    console.log(`[Memory] Memory Reset        : ${memoryReset}${resetReason ? ` (${resetReason})` : ""}`);

    // ── Step 1: Retrieve relevant chunks (using queryToUse) ─────────────────
    const retrieval = await retrieveChunks(supabase, queryToUse, {
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

    const result = await generateAnswer(queryToUse, promptChunks, retrievalMeta, !!filterDocumentId);

    // ── Document-scoped confidence guard ─────────────────────────────────────────────
    // When the user selects a SPECIFIC document, a Low Confidence result means
    // the retrieved chunks are weakly related to the query — the LLM may have
    // answered from training knowledge.  Block it here before it reaches the UI.
    if (filterDocumentId && result.confidence === "Low") {
      result.answer = GROUNDING_FAIL_MESSAGE;
    }

    const sourcePages: number[] = [
      ...new Set(
        retrieval.results.flatMap((c) => {
          const pages: number[] = [];
          for (let p = c.pageStart; p <= c.pageEnd; p++) pages.push(p);
          return pages;
        })
      ),
    ].sort((a, b) => a - b);

    // ── Save Turn to Conversational Memory ───────────────────────────────────
    if (result.answer && !result.answer.includes("EMPTY_QUERY") && !result.answer.includes("Failed to generate")) {
      saveTurn(sessionId, {
        userQuestion: query, // Store the original question asked by user
        finalAnswer: result.answer,
        documentId: filterDocumentId || undefined,
        pageNumbers: sourcePages,
        timestamp: new Date().toISOString(),
      });
    }

    // ── Return structured response ──────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      answer: result.answer,
      provider: result.provider,
      model: result.model,
      generationTimeMs: result.generationTimeMs,
      promptMetrics: result.promptMetrics,
      sourcePages,
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
