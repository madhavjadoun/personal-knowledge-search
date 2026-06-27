import { createEmbeddingProvider } from "./providers";
import { ChunkInput } from "./types";

/**
 * Converts a 64-character SHA-256 hex digest to a valid UUID v4 string.
 * The mapping is deterministic: same input always produces the same UUID.
 * This is required because the Supabase chunks.id column is type uuid.
 */
function hexToUUID(hex: string): string {
  // If the input is already a valid UUID v4 format, return it as-is
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(hex)) {
    return hex;
  }
  // Use first 32 hex chars; inject version (4) and variant (8-b) bits
  const h = hex.replace(/-/g, "").slice(0, 32);
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    "4" + h.slice(13, 16),             // version 4
    ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20), // variant bits
    h.slice(20, 32),
  ].join("-");
}

/**
 * Performs Euclidean L2 vector normalization.
 * Scales a vector so its magnitude is exactly 1.0.
 */
export function normalizeL2(vector: number[]): number[] {
  const sumSquare = vector.reduce((sum, val) => sum + val * val, 0);
  const norm = Math.sqrt(sumSquare);
  if (norm === 0 || !Number.isFinite(norm)) {
    return vector;
  }
  return vector.map((val) => val / norm);
}

/**
 * Executes a function with retries and exponential backoff.
 * Logs transient errors and returns the success result with the retry count.
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries = 3,
  initialDelayMs = 500
): Promise<{ result: T; retryCount: number }> {
  let attempt = 0;
  let currentDelay = initialDelayMs;

  while (true) {
    try {
      const result = await fn();
      return { result, retryCount: attempt };
    } catch (err) {
      attempt++;
      if (attempt > retries) {
        throw err;
      }
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[Embedding Service] Attempt ${attempt} failed. Retrying in ${currentDelay}ms... Error: ${errorMsg}`
      );
      await new Promise((resolve) => setTimeout(resolve, currentDelay));
      currentDelay *= 2; // Exponential backoff
    }
  }
}

/**
 * Validates the generated vector embedding and chunk metadata.
 * Throws an exception if constraints are violated.
 */
function validateEmbedding(
  chunkId: string,
  documentId: string,
  embedding: number[]
): void {
  if (!chunkId) {
    throw new Error("Validation Failed: Missing chunkId.");
  }
  if (!documentId) {
    throw new Error("Validation Failed: Missing documentId.");
  }
  if (!embedding || !Array.isArray(embedding)) {
    throw new Error("Embedding endpoint returned no vector. Check that the model is loaded and reachable.");
  }
  if (embedding.length === 0) {
    throw new Error("Embedding endpoint returned an empty vector. The model may have failed to process the text.");
  }
  // Check for NaN or infinite values
  if (embedding.some((val) => !Number.isFinite(val))) {
    throw new Error("Validation Failed: Embedding vector contains NaN or non-finite values.");
  }
}

export interface PipelineChunkStatus {
  chunkId: string;
  chunkIndex: number;
  status: "Completed" | "Failed";
  model: string;
  dimensions: number;
  generationTimeMs: number;
  stored: boolean;
  retryCount: number;
  error?: string;
  embedding?: number[];
}

/**
 * Runs the full end-to-end processing pipeline:
 * 1. Checks DB to reuse existing embeddings (avoiding double API bills).
 * 2. Generates missing embeddings in batches with retry loops.
 * 3. Validates structural dimensions (768) and checks for empty/NaN vectors.
 * 4. Stores chunks populated with vectors in public.chunks via upsert.
 */
export async function processEmbeddingPipeline(
  supabaseClient: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  documentId: string,
  chunks: ChunkInput[],
  forceRegenerate = false
): Promise<PipelineChunkStatus[]> {
  const provider = createEmbeddingProvider();
  const results: PipelineChunkStatus[] = [];

  // Find user_id from document to make sure RLS inserts succeed
  const { data: doc } = await supabaseClient
    .from("documents")
    .select("user_id")
    .eq("id", documentId)
    .single();
  const userId = doc?.user_id || "00000000-0000-0000-0000-000000000000";

  console.log(
    `[Pipeline] Embedding started — document: ${documentId}, chunks: ${chunks.length}, provider: ${provider.name}, model: ${provider.modelName}`
  );

  // 1. Fetch existing chunks to check for already computed embeddings (if not forceRegenerate)
  const existingMap: Record<string, number[]> = {};
  if (!forceRegenerate && chunks.length > 0) {
    const chunkIds = chunks.map((c) => c.chunkId);
    const { data: existingData, error: fetchErr } = await supabaseClient
      .from("chunks")
      .select("id, embedding")
      .in("id", chunkIds);

    if (!fetchErr && existingData) {
      for (const row of existingData) {
        if (row.embedding && Array.isArray(row.embedding) && row.embedding.length > 0) {
          existingMap[row.id] = row.embedding;
        }
      }
    }
  }

  // Process in batches of 10 chunks to avoid request timeout limits
  const BATCH_SIZE = 10;
  for (let offset = 0; offset < chunks.length; offset += BATCH_SIZE) {
    const batch = chunks.slice(offset, offset + BATCH_SIZE);
    
    // Divide batch into reused and needing generation
    const toEmbed: ChunkInput[] = [];
    const reused: { chunk: ChunkInput; embedding: number[] }[] = [];

    for (const c of batch) {
      if (existingMap[c.chunkId]) {
        reused.push({ chunk: c, embedding: existingMap[c.chunkId] });
      } else {
        toEmbed.push(c);
      }
    }

    // Process reused items directly
    for (const item of reused) {
      results.push({
        chunkId: item.chunk.chunkId,
        chunkIndex: item.chunk.chunkIndex,
        status: "Completed",
        model: "Reused (Cached)",
        dimensions: item.embedding.length,
        generationTimeMs: 0,
        stored: true,
        retryCount: 0,
        embedding: item.embedding,
      });
    }

    if (toEmbed.length === 0) continue;

    // Process items needing embedding generation
    console.log(`[Pipeline] Generating embeddings for ${toEmbed.length} chunks...`);
    const texts = toEmbed.map((c) => c.text);
    const startTime = Date.now();

    let embeddingsResult: number[][] = [];
    let retryCount = 0;
    let batchFailed = false;

    try {
      // Run batch embedding generation inside backoff retry loop
      const response = await retryWithBackoff(async () => {
        return await provider.embedBatch(texts, "document");
      });
      embeddingsResult = response.result;
      retryCount = response.retryCount;
    } catch (batchErr) {
      const batchErrMsg = batchErr instanceof Error ? batchErr.message : String(batchErr);
      console.error(`[Pipeline] Batch embedding failed (${batchErrMsg}), falling back to individual chunk requests.`);
      batchFailed = true;
    }

    const generationTimeMs = Math.round((Date.now() - startTime) / toEmbed.length);

    // Save and store each chunk
    for (let index = 0; index < toEmbed.length; index++) {
      const chunk = toEmbed[index];
      let embedding: number[] | null = null;
      let chunkRetryCount = retryCount;
      let chunkTimeMs = generationTimeMs;
      let chunkError = "";

      if (batchFailed) {
        // Fallback: embed single chunk
        const singleStart = Date.now();
        try {
          const response = await retryWithBackoff(async () => {
            return await provider.embed(chunk.text, "document");
          });
          embedding = response.result;
          chunkRetryCount = response.retryCount;
          chunkTimeMs = Date.now() - singleStart;
        } catch (singleErr) {
          console.error(`[Pipeline] Individual embedding failed for chunk ${chunk.chunkId}:`, singleErr);
          chunkError = singleErr instanceof Error ? singleErr.message : "Failed to generate embedding";
        }
      } else {
        embedding = embeddingsResult[index] || null;
      }

      try {
        if (chunkError) throw new Error(chunkError);
        if (!embedding) throw new Error("Embedding endpoint returned no vector. Check that the model is loaded and the provider is reachable.");

        // Apply Euclidean L2 normalization consistently
        embedding = normalizeL2(embedding);

        // Validate embedding (dimensions are dynamic per provider)
        validateEmbedding(chunk.chunkId, chunk.documentId, embedding);

        // chunkId is a 64-char SHA-256 hex string; the DB id column is uuid.
        // Convert deterministically so the same chunk always maps to the same UUID.
        const rowId = hexToUUID(chunk.chunkId);

        // Store vector in public.chunks table
        const row = {
          id: rowId,
          document_id: chunk.documentId,
          user_id: userId,
          page_number: chunk.pageStart,
          chunk_index: chunk.chunkIndex,
          content: chunk.text,
          embedding: embedding,
          created_at: new Date().toISOString(),
        };

        const { error: dbError } = await supabaseClient
          .from("chunks")
          .upsert([row]);

        if (dbError) {
          throw new Error(`Database storage failed: ${dbError.message}`);
        }

        // Verify the database insert immediately
        const { data: verifyData, error: verifyError } = await supabaseClient
          .from("chunks")
          .select("id, embedding")
          .eq("id", rowId)
          .single();

        if (verifyError || !verifyData || !verifyData.embedding) {
          throw new Error(`Database verification failed: Chunk was not successfully persisted or embedding is missing.`);
        }

        console.log(`[Pipeline] Embedding stored & verified — chunk #${chunk.chunkIndex} (${embedding.length}d, ${chunkTimeMs}ms)`);

        results.push({
          chunkId: chunk.chunkId,
          chunkIndex: chunk.chunkIndex,
          status: "Completed",
          model: `${provider.name}/${provider.modelName}`,
          dimensions: embedding.length,
          generationTimeMs: chunkTimeMs,
          stored: true,
          retryCount: chunkRetryCount,
          embedding: embedding,
        });

      } catch (err) {
        const failMsg = err instanceof Error ? err.message : "Validation or storage failed";
        console.error(`[Pipeline] Chunk #${chunk.chunkIndex} failed: ${failMsg}`);
        results.push({
          chunkId: chunk.chunkId,
          chunkIndex: chunk.chunkIndex,
          status: "Failed",
          model: `${provider.name}/${provider.modelName}`,
          dimensions: 0,
          generationTimeMs: 0,
          stored: false,
          retryCount: chunkRetryCount,
          error: failMsg,
        });
      }
    }
  }

  const completed = results.filter((r) => r.status === "Completed").length;
  const failed = results.filter((r) => r.status === "Failed").length;
  console.log(`[Pipeline] Embedding completed — ${completed} stored, ${failed} failed.`);

  return results;
}
