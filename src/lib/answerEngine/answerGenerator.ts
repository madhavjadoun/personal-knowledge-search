import { buildPrompt, detectAnswerStyle, AnswerStyle } from "./promptBuilder";
import { createLLMProvider, AnswerEngineError } from "./providers";
import { PromptChunk, RetrievalMeta, PromptBuilderOutput } from "./types";

// ── Output type ───────────────────────────────────────────────────────────────

/**
 * The structured response returned by generateAnswer().
 * The answer field contains only the final grounded answer text —
 * no chain-of-thought, no internal reasoning.
 */
export interface AnswerResult {
  /** The grounded answer from the LLM. */
  answer: string;
  /** The fully assembled prompt that was sent to the LLM. */
  prompt: PromptBuilderOutput;
  /** Prompt builder metrics (character counts, token estimate). */
  promptMetrics: {
    promptCharacters: number;
    tokenEstimate: number;
    contextCharacters: number;
    chunksIncluded: number;
  };
  /** The LLM model identifier, e.g. "qwen2.5:3b". */
  model: string;
  /** The LLM provider identifier, e.g. "ollama". */
  provider: string;
  /** Time taken by the LLM to generate the response (ms). */
  generationTimeMs: number;
  /** Confidence classification based on retrieval and generation feedback. */
  confidence: "High" | "Medium" | "Low";
  /** The detected answer style/intent of this run. */
  answerStyle: AnswerStyle;
}

// ── Confidence Helper ─────────────────────────────────────────────────────────

function calculateAnswerConfidence(
  answer: string,
  chunks: PromptChunk[]
): "High" | "Medium" | "Low" {
  // 1. If LLM replies with exact grounding check (unable to find answer), force Low confidence
  if (
    answer.includes("I could not find a confident answer") ||
    answer.trim() === "I could not find a confident answer in the provided context."
  ) {
    return "Low";
  }

  const chunkCount = chunks.length;
  if (chunkCount === 0) {
    return "Low";
  }

  // Extract cosine similarities
  const scores = chunks.map((c) => c.similarityScore);
  const maxScore = Math.max(...scores);
  const sumScores = scores.reduce((sum, s) => sum + s, 0);
  const avgScore = sumScores / chunkCount;

  // 2. High Confidence Criteria:
  //    - Strong top match (max score >= 0.65 similarity)
  //    - Multiple supporting chunks (>= 2 unique chunks)
  //    - Consistent evidence (average similarity >= 0.50)
  if (maxScore >= 0.65 && chunkCount >= 2 && avgScore >= 0.50) {
    return "High";
  }

  // 3. Medium Confidence Criteria:
  //    - Partial evidence: top match is at least 0.45 similarity
  if (maxScore >= 0.45) {
    return "Medium";
  }

  // 4. Low Confidence Criteria:
  //    - Weak retrieval or incomplete evidence
  return "Low";
}

// ── Post-processing clean helper ──────────────────────────────────────────────

function cleanResponse(text: string): string {
  let cleaned = text;

  // Handle PDF summarization block query directly (fallback check)
  if (cleaned.includes("Full document summarization is not available")) {
    return cleaned;
  }

  // 1. Remove raw LaTeX math escapes/wrappers
  cleaned = cleaned.replace(/\\\(|\\\)/g, ""); // remove \( and \)
  cleaned = cleaned.replace(/\\\[|\\\]/g, ""); // remove \[ and \]
  cleaned = cleaned.replace(/\\text\{([^}]+)\}/g, "$1"); // remove \text{...}
  cleaned = cleaned.replace(/\\mathrm\{([^}]+)\}/g, "$1"); // remove \mathrm{...}

  // 2. Clean broken bullet/list formatting artifacts
  cleaned = cleaned.replace(/^\s*[\*\-\+]\s*[\*\-\+]\s+/gm, "* "); // replace nested bullet marks "* *" with "* "
  cleaned = cleaned.replace(/^\s*\d+\.\s*\d+\.\s+/gm, "1. "); // replace nested numbering marks "1. 1. " with "1. "

  // 3. Deduplicate repeated consecutive paragraphs/lines
  const lines = cleaned.split("\n");
  const uniqueLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      uniqueLines.push("");
      continue;
    }
    // Skip exact duplicate consecutive lines
    if (uniqueLines.length > 0 && uniqueLines[uniqueLines.length - 1].trim() === trimmed) {
      continue;
    }
    uniqueLines.push(line);
  }
  cleaned = uniqueLines.join("\n");

  // 4. Clean up extra blank lines (limit multiple newlines to max double newline)
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  return cleaned.trim();
}

// ── informational metrics unique facts count helper ──────────────────────────

function estimateUniqueFacts(answer: string): number {
  const normalized = answer.trim();
  if (
    normalized.includes("I could not find a confident answer") ||
    normalized.includes("Full document summarization is not available") ||
    normalized.length === 0
  ) {
    return 0;
  }

  // Count informative sentence boundaries
  const sentences = normalized
    .split(/[.!?\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15); // only substantial fact-based statements

  // Count itemized list segments
  const bullets = normalized
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("*") || l.startsWith("-") || /^\d+\./.test(l));

  // The sum of factual sentences and unique bullet items is a robust metric
  return Math.max(sentences.length + bullets.length, 1);
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Orchestrates the full answer generation pipeline:
 *
 *   1. Build a grounded prompt from retrieved chunks (via PromptBuilder).
 *   2. Send prompt.fullPrompt to the active LLM provider.
 *   3. Return a structured result with the answer and all metrics.
 *
 * IMPORTANT: This function never sends a raw user query to the LLM.
 * It always uses buildPrompt() to assemble the full, grounded prompt first.
 *
 * @param query          - The original user question.
 * @param retrievedChunks - Ranked chunks from the retrieval engine.
 * @param retrievalMeta  - Optional metadata from the retrieval result for logging.
 * @returns              - Structured answer result.
 * @throws               - An AnswerEngineError object on any failure.
 */
export async function generateAnswer(
  query: string,
  retrievedChunks: PromptChunk[],
  retrievalMeta?: RetrievalMeta
): Promise<AnswerResult> {
  const style = detectAnswerStyle(query);

  // ── Sprint 5.3: PDF Summarization check ─────────────────────────────────────
  const cleanQuery = query.trim().toLowerCase();
  if (
    cleanQuery === "summarize this pdf" ||
    cleanQuery === "summarize pdf" ||
    cleanQuery === "summarize the pdf" ||
    cleanQuery === "summarize this document" ||
    cleanQuery === "summarize document" ||
    cleanQuery === "summarize the document"
  ) {
    const customAnswer =
      "Full document summarization is not available in the current retrieval mode. " +
      "Please ask about a specific topic, section, or concept from the document.";

    console.log(`[Answer Engine]`);
    console.log(`Type: SUMMARY`);
    console.log(`Chunks Used: 0`);
    console.log(`Unique Facts: 0`);
    console.log(`Generation: 0ms`);

    return {
      answer: customAnswer,
      prompt: {
        systemPrompt: "",
        context: "",
        userPrompt: "",
        fullPrompt: "",
        tokenEstimate: 0,
        contextCharacters: 0,
      },
      promptMetrics: {
        promptCharacters: 0,
        tokenEstimate: 0,
        contextCharacters: 0,
        chunksIncluded: 0,
      },
      model: "local",
      provider: "system",
      generationTimeMs: 0,
      confidence: "Low",
      answerStyle: "SUMMARY",
    };
  }

  // ── 1. Get provider (validates env vars, never bypasses factory) ────────────
  let llmProvider;
  try {
    llmProvider = createLLMProvider();
  } catch (err) {
    // Re-throw as typed error so the caller can handle it
    throw err as AnswerEngineError;
  }

  // ── 2. Build the grounded prompt ────────────────────────────────────────────
  // buildPrompt() is pure — no I/O, no side effects.
  // We ALWAYS use its output; never construct the prompt manually.
  const prompt = buildPrompt({
    query,
    chunks: retrievedChunks,
    meta: retrievalMeta,
  });

  // ── 3. Audit log before generation ─────────────────────────────────────────
  console.log(`[AnswerEngine] ════════════════════════════════════════`);
  console.log(`[AnswerEngine] Generation Started`);
  console.log(`[AnswerEngine] Provider         : ${llmProvider.name}`);
  console.log(`[AnswerEngine] Model            : ${llmProvider.modelName}`);
  console.log(`[AnswerEngine] Answer Style     : ${style}`);
  console.log(`[AnswerEngine] Prompt Characters: ${prompt.fullPrompt.length}`);
  console.log(`[AnswerEngine] Estimated Tokens : ~${prompt.tokenEstimate}`);
  console.log(`[AnswerEngine] Context Size     : ${prompt.contextCharacters} chars`);
  console.log(`[AnswerEngine] Chunks in prompt : ${retrievedChunks.length}`);

  // ── 4. Generate answer ──────────────────────────────────────────────────────
  const genStart = Date.now();
  let rawAnswer: string;
  try {
    rawAnswer = await llmProvider.generate(prompt.fullPrompt);
  } catch (err) {
    // Re-throw typed AnswerEngineError from provider
    throw err as AnswerEngineError;
  }
  const generationTimeMs = Date.now() - genStart;

  // ── 5. Clean & post-process answer ─────────────────────────────────────────
  const finalAnswer = cleanResponse(rawAnswer);

  // ── 6. Compute metrics & confidence ────────────────────────────────────────
  const confidence = calculateAnswerConfidence(finalAnswer, retrievedChunks);
  const uniqueFacts = estimateUniqueFacts(finalAnswer);

  // ── 7. Post-generation audit logs ──────────────────────────────────────────
  const preview = finalAnswer.slice(0, 300).replace(/\n/g, " ");
  console.log(`[AnswerEngine] Generation Time  : ${generationTimeMs}ms`);
  console.log(`[AnswerEngine] Output Characters: ${finalAnswer.length}`);
  console.log(`[AnswerEngine] Output Preview   : "${preview}${finalAnswer.length > 300 ? "…" : ""}"`);
  console.log(`[AnswerEngine] Computed Confidence: ${confidence}`);
  console.log(`[AnswerEngine] ════════════════════════════════════════`);

  console.log(`[Answer Engine]`);
  console.log(`Type: ${style}`);
  console.log(`Chunks Used: ${retrievedChunks.length}`);
  console.log(`Unique Facts: ${uniqueFacts}`);
  console.log(`Generation: ${generationTimeMs}ms`);

  // ── 8. Return structured result ─────────────────────────────────────────────
  return {
    answer: finalAnswer,
    prompt,
    promptMetrics: {
      promptCharacters: prompt.fullPrompt.length,
      tokenEstimate: prompt.tokenEstimate,
      contextCharacters: prompt.contextCharacters,
      chunksIncluded: retrievedChunks.length,
    },
    model: llmProvider.modelName,
    provider: llmProvider.name,
    generationTimeMs,
    confidence,
    answerStyle: style,
  };
}
