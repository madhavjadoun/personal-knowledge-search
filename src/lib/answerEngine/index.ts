/**
 * answerEngine — Sprint 5.1 + 5.2
 *
 * Sprint 5.1: Prompt Builder (pure, no LLM calls)
 * Sprint 5.2: LLM provider abstraction + Answer Generator
 */

// ── Sprint 5.1: Prompt Builder ────────────────────────────────────────────────
export { buildPrompt } from "./promptBuilder";
export type {
  PromptChunk,
  RetrievalMeta,
  PromptBuilderInput,
  PromptBuilderOutput,
} from "./types";

// ── Sprint 5.2: LLM Providers ─────────────────────────────────────────────────
export { createLLMProvider } from "./providers";
export type { LLMProvider, AnswerEngineError } from "./providers";

// ── Sprint 5.2: Answer Generator ─────────────────────────────────────────────
export { generateAnswer, GROUNDING_FAIL_MESSAGE } from "./answerGenerator";
export type { AnswerResult } from "./answerGenerator";
