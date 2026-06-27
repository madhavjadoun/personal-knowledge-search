/**
 * A single retrieved chunk passed into the prompt builder.
 * Intentionally mirrors the RetrievedChunk shape from the retrieval engine
 * so the caller can pass results through without adaptation.
 */
export interface PromptChunk {
  /** UUID of the chunk row in public.chunks */
  chunkId: string;
  /** UUID of the parent document */
  documentId: string;
  /** Page number where this chunk starts */
  pageStart: number;
  /** Page number where this chunk ends (often equal to pageStart) */
  pageEnd: number;
  /** 0-based position of this chunk inside the document */
  chunkIndex: number;
  /** Cosine similarity score [0, 1] */
  similarityScore: number;
  /** Full text content of the chunk */
  fullText: string;
}

/**
 * Optional metadata about the retrieval run, forwarded verbatim into the
 * audit log so the caller can trace where the context came from.
 */
export interface RetrievalMeta {
  provider?: string;
  model?: string;
  embeddingTimeMs?: number;
  searchTimeMs?: number;
  totalTimeMs?: number;
  returnedChunks?: number;
  averageSimilarity?: number;
}

/**
 * Input to buildPrompt().
 */
export interface PromptBuilderInput {
  /** The original, unmodified user question. */
  query: string;
  /** Ranked retrieved chunks (highest similarity first). */
  chunks: PromptChunk[];
  /** Optional retrieval metadata for audit logging. */
  meta?: RetrievalMeta;
}

/**
 * Structured output of buildPrompt().
 */
export interface PromptBuilderOutput {
  /** LLM system instructions (provider-agnostic). */
  systemPrompt: string;
  /** Formatted context section containing all chunk blocks. */
  context: string;
  /** Formatted user question section. */
  userPrompt: string;
  /**
   * Fully assembled prompt ready to be sent to any LLM.
   * Order: systemPrompt + context + userPrompt.
   */
  fullPrompt: string;
  /** Rough token estimate: total characters ÷ 4. */
  tokenEstimate: number;
  /** Total character count of the context section only. */
  contextCharacters: number;
}
