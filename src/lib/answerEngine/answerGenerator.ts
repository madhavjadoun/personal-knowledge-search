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

/**
 * Weighted multi-signal confidence model.
 *
 * Signal weights:
 *   max similarity       35 %  — strength of the single best match
 *   average similarity   25 %  — consistency of all retrieved evidence
 *   chunk count          20 %  — breadth of supporting context (diminishing)
 *   context coverage     20 %  — total characters of grounding material
 *
 * Thresholds (composite 0-1 score):
 *   >= 0.72  → High
 *   >= 0.45  → Medium
 *    < 0.45  → Low
 */
function calculateAnswerConfidence(
  answer: string,
  chunks: PromptChunk[],
  contextCharacters?: number
): "High" | "Medium" | "Low" {
  // Grounding-fail → always Low regardless of retrieval scores
  if (
    answer.includes("I couldn't find enough information") ||
    answer.includes("I could not find a confident answer")
  ) {
    return "Low";
  }

  const chunkCount = chunks.length;
  if (chunkCount === 0) return "Low";

  const scores = chunks.map((c) => c.similarityScore);
  const maxScore  = Math.max(...scores);
  const avgScore  = scores.reduce((s, x) => s + x, 0) / chunkCount;

  // Chunk count signal: saturates at 5 chunks (score 1.0)
  const chunkSignal = Math.min(chunkCount / 5, 1.0);

  // Context coverage signal: saturates at 4 000 characters
  const ctxChars = contextCharacters ?? 0;
  const ctxSignal = Math.min(ctxChars / 4000, 1.0);

  const composite =
    maxScore   * 0.35 +
    avgScore   * 0.25 +
    chunkSignal * 0.20 +
    ctxSignal  * 0.20;

  if (composite >= 0.72) return "High";
  if (composite >= 0.45) return "Medium";
  return "Low";
}

// ── Friendly grounding-fail message ──────────────────────────────────────────

export const GROUNDING_FAIL_MESSAGE =
  "I couldn't find enough information in the selected document to answer this confidently.\n\n" +
  "Try:\n" +
  "- Rephrasing your question\n" +
  "- Increasing Top K\n" +
  "- Selecting another document";

// ── Post-processing clean helper ──────────────────────────────────────────────

/**
 * Sentence fingerprint for near-duplicate detection.
 * Lowercases, strips punctuation and extra spaces, returns a compact string.
 */
function sentenceFingerprint(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanResponse(text: string): string {
  let cleaned = text;

  // Pass-through: system-generated special messages
  if (cleaned.includes("Full document summarization is not available")) {
    return cleaned;
  }

  // 1. Substitute generic grounding-fail sentinel → friendly message
  if (
    cleaned.includes("I could not find a confident answer") ||
    cleaned.trim() === "I could not find a confident answer in the provided context."
  ) {
    return GROUNDING_FAIL_MESSAGE;
  }

  // 2. Remove escaped LaTeX / markdown characters
  cleaned = cleaned.replace(/\\\(|\\\)/g, "");          // \( \)
  cleaned = cleaned.replace(/\\\[|\\\]/g, "");          // \[ \]
  cleaned = cleaned.replace(/\\\*/g, "");               // \*
  cleaned = cleaned.replace(/\\_/g, "");                // \_
  cleaned = cleaned.replace(/\\`/g, "");                // \`
  cleaned = cleaned.replace(/\\text\{([^}]+)\}/g, "$1");   // \text{...}
  cleaned = cleaned.replace(/\\mathrm\{([^}]+)\}/g, "$1"); // \mathrm{...}
  cleaned = cleaned.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "$1/$2"); // \frac{a}{b} → a/b

  // 3. Fix broken bullet / numbered-list artifacts
  cleaned = cleaned.replace(/^\s*[\*\-\+]\s*[\*\-\+]\s+/gm, "- "); // "* *" → "- "
  cleaned = cleaned.replace(/^\s*\d+\.\s*\d+\.\s+/gm, "1. ");       // "1. 1. " → "1. "

  // 4. Deduplicate by sentence fingerprint (not just consecutive-line exact match)
  const lines = cleaned.split("\n");
  const seenFingerprints = new Set<string>();
  const uniqueLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Always preserve blank lines and structural markdown
    if (
      trimmed === "" ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("|") ||
      trimmed.startsWith("-") ||
      trimmed.startsWith("*") ||
      /^\d+\./.test(trimmed)
    ) {
      uniqueLines.push(line);
      continue;
    }

    const fp = sentenceFingerprint(trimmed);
    if (fp.length < 10 || !seenFingerprints.has(fp)) {
      seenFingerprints.add(fp);
      uniqueLines.push(line);
    }
    // else: silently drop near-duplicate sentence
  }

  cleaned = uniqueLines.join("\n");

  // 5. Trim trailing whitespace from each line
  cleaned = cleaned
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n");

  // 6. Collapse 3+ consecutive blank lines to max 2
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  cleaned = cleaned.trim();

  // 7. Off-context admission detector — PERMANENT FIX
  //
  // Small LLMs (e.g. qwen2.5:3b) often answer from training knowledge while
  // simultaneously admitting the retrieved context doesn't contain the answer.
  // We detect these admission phrases and replace the entire response with the
  // grounding-fail message.  This works regardless of similarity thresholds.
  const OFF_CONTEXT_PATTERNS: RegExp[] = [
    /the (retrieved |provided |given )?context (provided |given )?(does not|doesn'?t) (contain|have|include|address|cover|provide)/i,
    /the (document|pdf|passage|text|material|content) (provided |given )?(does not|doesn'?t) (contain|have|include|mention|discuss|address)/i,
    /not (directly|specifically|explicitly) (mentioned|stated|covered|found|addressed|available|included) in the (context|document|pdf|provided|retrieved)/i,
    /the context (does not|doesn'?t) (specifically |directly )?(mention|address|cover|include|contain|discuss)/i,
    /based on (general|my|broader|common|background) knowledge/i,
    /while (this |it |the topic )?(is not|isn'?t) (directly|explicitly|specifically) (mentioned|covered|addressed|found) in the (context|document|pdf)/i,
    /(I|we) (don'?t|do not|cannot|can'?t) find (this|that|specific|any) information (about|regarding|on) .{0,60} in the (context|document|selected|provided)/i,
    /the (selected|provided|given|uploaded) (document|pdf|file) (does not|doesn'?t|may not) (contain|have|include|address)/i,
    /no (specific|direct|relevant|explicit) (information|data|content|reference|mention) (about|on|regarding) .{0,60} (is available|found|exists) in the (context|document|pdf)/i,
  ];

  for (const pattern of OFF_CONTEXT_PATTERNS) {
    if (pattern.test(cleaned)) {
      return GROUNDING_FAIL_MESSAGE;
    }
  }

  return cleaned;
}

// ── informational metrics unique facts count helper ──────────────────────────

function estimateUniqueFacts(answer: string): number {
  const normalized = answer.trim();
  if (
    normalized.includes("I couldn't find enough information") ||
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
  retrievalMeta?: RetrievalMeta,
  hasDocumentFilter?: boolean
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

  // ── Out-of-domain guard (pre-flight similarity check) ────────────────────────
  //
  // Two-tier threshold:
  //   • Specific document selected (hasDocumentFilter=true): 0.50
  //     The user is asking about a particular PDF — we must be confident
  //     the content is actually IN that document before calling the LLM.
  //   • All documents (hasDocumentFilter=false/undefined): 0.40
  //     Broader search — slightly more lenient.
  const domainCheckMaxSim =
    retrievedChunks.length > 0
      ? Math.max(...retrievedChunks.map((c) => c.similarityScore))
      : 0;
  const WEAK_SIGNAL_THRESHOLD = hasDocumentFilter ? 0.50 : 0.40;

  if (domainCheckMaxSim < WEAK_SIGNAL_THRESHOLD) {
    console.log(
      `[AnswerEngine] Out-of-domain guard — max sim ${domainCheckMaxSim.toFixed(4)} < ${WEAK_SIGNAL_THRESHOLD} (filter=${!!hasDocumentFilter}), skipping LLM`
    );
    return {
      answer: GROUNDING_FAIL_MESSAGE,
      prompt: { systemPrompt: "", context: "", userPrompt: "", fullPrompt: "", tokenEstimate: 0, contextCharacters: 0 },
      promptMetrics: { promptCharacters: 0, tokenEstimate: 0, contextCharacters: 0, chunksIncluded: retrievedChunks.length },
      model: "local",
      provider: "system",
      generationTimeMs: 0,
      confidence: "Low",
      answerStyle: style,
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
  const confidence = calculateAnswerConfidence(
    finalAnswer,
    retrievedChunks,
    prompt.contextCharacters
  );
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
