import { createEmbeddingProvider } from "../embeddingPipeline/providers";
import { validateQuery } from "./queryValidator";
import {
  RetrievalConfig,
  RetrievalResult,
  RetrievedChunk,
  ConfidenceLevel,
} from "./types";
import { normalizeL2 } from "../embeddingPipeline/service";

// ── Query Intent Detection & Adaptive Top-K ───────────────────────────────────

export type QueryIntent =
  | "FACT"
  | "EXPLAIN"
  | "LIST"
  | "COMPARE"
  | "STEP_BY_STEP"
  | "CALCULATION"
  | "YES_NO";

export const INTENT_TOPK_MAP: Record<QueryIntent, number> = {
  FACT: 5,
  CALCULATION: 5,
  YES_NO: 6,
  COMPARE: 8,
  EXPLAIN: 8,
  STEP_BY_STEP: 8,
  LIST: 10,
};

export function detectIntent(query: string): QueryIntent {
  const q = query.trim().toLowerCase();

  // 1. COMPARE
  if (/\b(compare|contrast|versus|vs\.?|difference between|differ|comparison)\b/.test(q)) {
    return "COMPARE";
  }

  // 2. STEP_BY_STEP
  if (/^how (to|do|can|should|does)\b/.test(q) || /\b(step-by-step|step by step|steps? to|walk me through|procedure)\b/.test(q)) {
    return "STEP_BY_STEP";
  }

  // 3. CALCULATION
  if (
    /\b(calculate|solve|evaluate|compute|math|formula|equation|sum|product|divided by|multiply|subtract)\b/.test(q) ||
    /\b\(\d+\s*,\s*\d+\)/.test(q) // matches coordinates like (2,1)
  ) {
    return "CALCULATION";
  }

  // 4. YES_NO
  if (/^(is|are|can|will|do|does|should|has|have|was|were|if|whether)\b/.test(q)) {
    return "YES_NO";
  }

  // 5. LIST
  if (
    /^(list|name|give|enumerate)\b/.test(q) || 
    /\b(what are the|what were the|all topics|all concepts|all algorithms|what concepts|what algorithms)\b/.test(q)
  ) {
    return "LIST";
  }

  // 6. EXPLAIN
  if (
    /\b(explain|summarize|summary|why does|why is|causes? of|what causes)\b/.test(q) ||
    /explain simply/i.test(q)
  ) {
    return "EXPLAIN";
  }

  // 7. FACT (default)
  return "FACT";
}

// ── Duplicate Topic Jaccard Helpers ───────────────────────────────────────────

function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ── Typed shape for a row from public.chunks ─────────────────────────────────
interface ChunkDbRow {
  id: string;
  document_id: string;
  page_number: number;
  chunk_index: number;
  content: string;
  // PostgREST returns pgvector columns as a JSON-serialised string "[n,n,n,…]"
  // not as a native number[]. We accept both here and parse below.
  embedding: string | number[];
}

// ── Tuning constants ──────────────────────────────────────────────────────────

/**
 * ABSOLUTE_FLOOR — hard minimum cosine similarity for any result to be kept.
 * Even if it passes the relative filter, a chunk this weak is not relevant.
 */
const ABSOLUTE_FLOOR = 0.30;

/**
 * RELATIVE_DROP — relative gap filter.
 * Any chunk whose similarity is < bestScore * (1 - RELATIVE_DROP) is discarded.
 *
 * Example: bestScore=0.85, RELATIVE_DROP=0.25 → floor = 0.85 * 0.75 = 0.638
 * Anything below 0.638 is dropped even if it's above ABSOLUTE_FLOOR.
 *
 * This prevents weak, out-of-domain chunks from contaminating the result set
 * when the best chunk is a strong match.
 */
const RELATIVE_DROP = 0.25;

/**
 * OUT_OF_DOMAIN_CEILING — if the BEST similarity across all candidates is below
 * this value the query is considered out-of-domain and we return no results.
 *
 * Calibrated for nomic-embed-text with 768-dim cosine: scores on completely
 * unrelated topics (e.g. "Narendra Modi" against CS/ML documents) typically
 * land in the 0.15–0.25 range.
 */
const OUT_OF_DOMAIN_CEILING = 0.35;

// ── Confidence classification ─────────────────────────────────────────────────

/**
 * Map an average similarity score to a confidence label.
 *
 * Thresholds are calibrated for nomic-embed-text / sentence-level chunks:
 *   ≥ 0.70 → High   (very close semantic match)
 *   ≥ 0.45 → Medium (relevant but not exact)
 *   <  0.45 → Low   (borderline — consider widening query)
 */
function classifyConfidence(avgSimilarity: number): ConfidenceLevel {
  if (avgSimilarity >= 0.70) return "High";
  if (avgSimilarity >= 0.45) return "Medium";
  return "Low";
}

// ── Vector math helpers ───────────────────────────────────────────────────────

/**
 * Parse a pgvector value returned by Supabase PostgREST.
 *
 * The REST API serialises the `vector` column as a plain JSON string:
 *   "[0.123,0.456,…]"
 * not as a native JS array. We must parse it before doing any math.
 * If the value already is a number[] (e.g. from a future SDK version), it
 * passes through unchanged.
 */
function parseEmbedding(raw: string | number[]): number[] | null {
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw === "string" && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as number[];
    } catch {
      // malformed — caller skips this row
    }
  }
  return null;
}

/** Dot product of two equal-length number arrays. */
function dotProduct(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i++) sum += a[i] * b[i];
  return sum;
}

/** Euclidean norm (magnitude / L2 norm). */
function vectorMagnitude(a: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * a[i];
  return Math.sqrt(sum);
}

/**
 * Cosine similarity between two vectors.
 * Returns a value in [-1, 1].  1 = identical direction, 0 = orthogonal.
 * Returns 0 when either vector is the zero-vector (safe default).
 */
function cosineSimilarity(a: number[], b: number[]): number {
  const magA = vectorMagnitude(a);
  const magB = vectorMagnitude(b);
  if (magA === 0 || magB === 0) return 0;
  return dotProduct(a, b) / (magA * magB);
}

// ── Preview helper ────────────────────────────────────────────────────────────

/**
 * Build a short readable preview from chunk text.
 * Prefers cutting at sentence boundaries; falls back to word boundaries.
 */
function buildPreview(text: string, targetLength = 200): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= targetLength) return flat;

  const win = flat.substring(0, targetLength);
  const sentenceRegex = /[.!?](\s+|$)/g;
  let match;
  let bestCutoff = -1;
  while ((match = sentenceRegex.exec(win)) !== null) {
    if (match.index >= targetLength - 80) bestCutoff = match.index + 1;
  }
  if (bestCutoff > 0) return flat.substring(0, bestCutoff).trim();

  const lastSpace = win.lastIndexOf(" ");
  if (lastSpace > targetLength - 40) return flat.substring(0, lastSpace).trim() + "…";

  return flat.substring(0, targetLength).trim() + "…";
}

// ── Main retrieval function ───────────────────────────────────────────────────

/**
 * Retrieve the most semantically similar chunks for `rawQuery`.
 *
 * Pipeline
 * ─────────
 * 1.  Validate & trim query
 * 2.  Embed query via active EmbeddingProvider
 * 3.  Validate & L2-normalise query embedding
 * 4.  Fetch ALL candidate rows from public.chunks
 * 5.  Score every candidate (parse → validate → normalise → cosine sim)
 * 6.  Out-of-domain check: if best score < OUT_OF_DOMAIN_CEILING → NO_MATCHING_CHUNKS
 * 7.  Relative gap filter: drop chunks > RELATIVE_DROP below the best score
 * 8.  Absolute floor: drop chunks below ABSOLUTE_FLOOR
 * 9.  Sort descending, deduplicate, Top-K
 * 10. Classify confidence (High / Medium / Low)
 * 11. Return structured result
 */
export async function retrieveChunks(
  supabaseClient: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  rawQuery: string,
  config: RetrievalConfig
): Promise<RetrievalResult> {
  const totalStart = Date.now();

  // ── 1. Validate query ───────────────────────────────────────────────────────
  const query = validateQuery(rawQuery);
  const intent = detectIntent(query);
  const adaptiveTopK = INTENT_TOPK_MAP[intent];

  console.log(`\n[Retrieval] ═══════════════════════════════════════════════`);
  console.log(`[Retrieval] Query    : "${query}"`);
  console.log(`[Retrieval] Intent   : ${intent}`);
  console.log(`[Retrieval] Adaptive Top-K: ${adaptiveTopK}`);

  // ── 2. Get provider ─────────────────────────────────────────────────────────
  let provider;
  try {
    provider = createEmbeddingProvider();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw { code: "PROVIDER_UNAVAILABLE", message: `Embedding provider unavailable: ${msg}` };
  }

  console.log(`[Retrieval] Provider : ${provider.name}`);
  console.log(`[Retrieval] Model    : ${provider.modelName}`);

  // ── 3. Embed query ──────────────────────────────────────────────────────────
  const embedStart = Date.now();
  let rawQueryEmbedding: number[];
  try {
    rawQueryEmbedding = await provider.embed(query, "query");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw { code: "EMBEDDING_FAILED", message: `Failed to embed query: ${msg}` };
  }
  const embeddingTimeMs = Date.now() - embedStart;

  if (!rawQueryEmbedding || rawQueryEmbedding.length === 0) {
    throw { code: "EMBEDDING_FAILED", message: "Provider returned empty embedding for query." };
  }
  if (rawQueryEmbedding.some((v) => !Number.isFinite(v) || isNaN(v))) {
    throw { code: "EMBEDDING_FAILED", message: "Query embedding contains non-finite values." };
  }
  if (rawQueryEmbedding.every((v) => v === 0)) {
    throw { code: "EMBEDDING_FAILED", message: "Query embedding is all zeros." };
  }

  const queryVec = normalizeL2(rawQueryEmbedding);
  const queryDim = queryVec.length;

  console.log(`[Retrieval] Embedding dim : ${queryDim}`);
  console.log(`[Retrieval] First 10 vals : [${queryVec.slice(0, 10).map(v => v.toFixed(6)).join(", ")}]`);

  // ── 4. Fetch candidates from public.chunks ──────────────────────────────────
  const searchStart = Date.now();
  const effectiveThreshold = Math.max(
    config.similarityThreshold ?? ABSOLUTE_FLOOR,
    ABSOLUTE_FLOOR
  );
  console.log(
    `[Retrieval] topK=${config.topK}  configThreshold=${config.similarityThreshold}` +
    `  effectiveFloor=${effectiveThreshold}  docFilter=${config.filterDocumentId || "none"}`
  );

  const { count: totalRows } = await supabaseClient
    .from("chunks")
    .select("id", { count: "exact", head: true });

  let q = supabaseClient
    .from("chunks")
    .select("id, document_id, page_number, chunk_index, content, embedding");

  if (config.filterDocumentId) {
    q = q.eq("document_id", config.filterDocumentId);
  }

  const { data: candidates, error: fetchError } = await q;
  const searchTimeMs = Date.now() - searchStart;

  if (fetchError) {
    console.error("[Retrieval] Fetch error:", fetchError.message);
    throw { code: "SEARCH_FAILED", message: `Fetch from public.chunks failed: ${fetchError.message}` };
  }

  const rowsAfterFilter = candidates ? (candidates as ChunkDbRow[]).length : 0;
  console.log(`[Retrieval] Rows in table   : ${totalRows ?? "?"}`);
  console.log(`[Retrieval] Rows fetched    : ${rowsAfterFilter}`);

  if (!candidates || candidates.length === 0) {
    if ((totalRows ?? 0) === 0) {
      throw { code: "NO_EMBEDDINGS_FOUND", message: "No embeddings stored yet. Process and embed documents first." };
    }
    throw { code: "NO_MATCHING_CHUNKS", message: "No chunks found for the given document filter." };
  }

  // ── 5. Score every candidate ────────────────────────────────────────────────
  interface ScoredRow {
    row: ChunkDbRow;
    similarity: number;
  }

  const scored: ScoredRow[] = [];
  let skippedInvalid = 0;

  console.log(`[Retrieval] ─── Candidate Scoring ──────────────────────────`);

  for (const raw of candidates as ChunkDbRow[]) {
    const parsed = parseEmbedding(raw.embedding);
    if (!parsed) {
      console.log(`  [SKIP] ${raw.id} — embedding not parseable`);
      skippedInvalid++;
      continue;
    }
    if (parsed.length !== queryDim) {
      console.log(`  [SKIP] ${raw.id} — dim mismatch (stored=${parsed.length}, query=${queryDim})`);
      skippedInvalid++;
      continue;
    }
    if (parsed.length === 0 || parsed.some((v) => !Number.isFinite(v) || isNaN(v))) {
      console.log(`  [SKIP] ${raw.id} — invalid values`);
      skippedInvalid++;
      continue;
    }

    const storedVec = normalizeL2(parsed);
    const dot = dotProduct(queryVec, storedVec);
    const magQ = vectorMagnitude(queryVec);
    const magS = vectorMagnitude(storedVec);
    const similarity = cosineSimilarity(queryVec, storedVec);
    const distance = 1 - similarity;

    console.log(
      `  ${raw.id.slice(0, 8)}… | ` +
      `dot=${dot.toFixed(6)} magQ=${magQ.toFixed(4)} magS=${magS.toFixed(4)} | ` +
      `sim=${similarity.toFixed(6)} dist=${distance.toFixed(6)}`
    );

    scored.push({ row: raw, similarity });
  }

  // Sort descending by similarity — needed for out-of-domain check and gap filter
  scored.sort((a, b) => b.similarity - a.similarity);

  const bestScore = scored.length > 0 ? scored[0].similarity : 0;

  console.log(`[Retrieval] ─── Filtering ───────────────────────────────────`);
  console.log(`[Retrieval] Best score          : ${bestScore.toFixed(6)}`);
  console.log(`[Retrieval] Out-of-domain ceil  : ${OUT_OF_DOMAIN_CEILING}`);
  console.log(`[Retrieval] Absolute floor      : ${effectiveThreshold}`);
  console.log(`[Retrieval] Relative drop limit : ${RELATIVE_DROP * 100}% below best`);

  // ── 6. Out-of-domain detection ──────────────────────────────────────────────
  // If even the best chunk doesn't clear the domain ceiling, nothing in the
  // knowledge base is relevant enough to answer this query.
  if (bestScore < OUT_OF_DOMAIN_CEILING) {
    console.log(
      `[Retrieval] OUT-OF-DOMAIN: best score ${bestScore.toFixed(4)} < ceiling ${OUT_OF_DOMAIN_CEILING}.` +
      ` Query is unrelated to indexed documents.`
    );
    console.log(`[Retrieval] ═══════════════════════════════════════════════\n`);
    throw {
      code: "NO_MATCHING_CHUNKS",
      message: "No relevant chunks found in the knowledge base for this query.",
    };
  }

  // ── 7. Relative gap filter + absolute floor ─────────────────────────────────
  // relativeCeiling = minimum score a chunk must reach to not be far below best
  const relativeCeiling = bestScore * (1 - RELATIVE_DROP);
  const dynamicFloor = Math.max(effectiveThreshold, relativeCeiling);
  console.log(`[Retrieval] Dynamic floor (max of absolute+relative) : ${dynamicFloor.toFixed(6)}`);

  let belowDynamicFloor = 0;
  const passing: ScoredRow[] = [];

  for (const s of scored) {
    if (s.similarity < dynamicFloor) {
      console.log(
        `  [DROP] ${s.row.id.slice(0, 8)}… sim=${s.similarity.toFixed(4)} < floor=${dynamicFloor.toFixed(4)}`
      );
      belowDynamicFloor++;
    } else {
      passing.push(s);
    }
  }

  console.log(`[Retrieval] Passed dynamic filter : ${passing.length}`);
  console.log(`[Retrieval] Dropped by filter     : ${belowDynamicFloor}`);

  // ── 8. Deduplicate & Filter Duplicate Topics → Adaptive Top-K ──────────────
  const seenIds = new Set<string>();
  const finalScored: ScoredRow[] = [];
  let duplicatesRemovedCount = 0;

  for (const candidate of passing) {
    if (finalScored.length >= adaptiveTopK) {
      break;
    }

    if (seenIds.has(candidate.row.id)) {
      continue;
    }

    // Jaccard similarity word-overlap check for duplicate topic filtering
    const candidateTokens = tokenSet(candidate.row.content);
    let isRedundant = false;

    for (const acc of finalScored) {
      const accTokens = tokenSet(acc.row.content);
      const similarity = jaccardSimilarity(candidateTokens, accTokens);
      if (similarity >= 0.50) {
        isRedundant = true;
        break;
      }
    }

    if (isRedundant) {
      duplicatesRemovedCount++;
    } else {
      seenIds.add(candidate.row.id);
      finalScored.push(candidate);
    }
  }

  const topK = finalScored;

  if (topK.length === 0) {
    console.log(`[Retrieval] No chunks survived filters.`);
    console.log(`[Retrieval] ═══════════════════════════════════════════════\n`);
    throw {
      code: "NO_MATCHING_CHUNKS",
      message: "No chunks matched the query above the similarity threshold. Try broadening your query.",
    };
  }

  // ── 9. Build result objects ─────────────────────────────────────────────────
  const finalResults: RetrievedChunk[] = topK.map(({ row, similarity }) => ({
    chunkId: row.id,
    documentId: row.document_id,
    pageStart: row.page_number,
    pageEnd: row.page_number,
    chunkIndex: row.chunk_index,
    similarityScore: Math.round(similarity * 10000) / 10000,
    confidence: classifyConfidence(similarity),
    characterCount: row.content ? row.content.length : 0,
    preview: buildPreview(row.content || ""),
    fullText: row.content || "",
  }));

  const averageSimilarity =
    finalResults.reduce((s, r) => s + r.similarityScore, 0) / finalResults.length;
  const overallConfidence = classifyConfidence(averageSimilarity);

  // ── 10. Audit summary ───────────────────────────────────────────────────────
  const totalTimeMs = Date.now() - totalStart;

  console.log(`[Retrieval] ─── Summary ─────────────────────────────────────`);
  console.log(`[Retrieval] Rows scanned          : ${rowsAfterFilter}`);
  console.log(`[Retrieval] Skipped (invalid)     : ${skippedInvalid}`);
  console.log(`[Retrieval] Dropped (out-of-domain checked via best score)`);
  console.log(`[Retrieval] Dropped by filter     : ${belowDynamicFloor}`);
  console.log(`[Retrieval] Final returned chunks : ${finalResults.length}`);
  console.log(`[Retrieval] Average similarity    : ${averageSimilarity.toFixed(4)}`);
  console.log(`[Retrieval] Overall confidence    : ${overallConfidence}`);
  console.log(`[Retrieval] Top-K similarities   : [${finalResults.map(r => r.similarityScore.toFixed(4)).join(", ")}]`);
  console.log(`[Retrieval] ═══════════════════════════════════════════════\n`);

  console.log(`[Retriever]`);
  console.log(`Intent: ${intent}`);
  console.log(`TopK: ${adaptiveTopK}`);
  console.log(`Retrieved: ${finalScored.length + duplicatesRemovedCount}`);
  console.log(`Unique: ${finalScored.length}`);
  console.log(`Duplicates Removed: ${duplicatesRemovedCount}`);
  console.log(`Retrieval Time: ${totalTimeMs}ms`);

  return {
    query,
    provider: provider.name,
    model: provider.modelName,
    embeddingTimeMs,
    searchTimeMs,
    totalTimeMs,
    returnedChunks: finalResults.length,
    averageSimilarity: Math.round(averageSimilarity * 10000) / 10000,
    confidence: overallConfidence,
    results: finalResults,
  };
}
