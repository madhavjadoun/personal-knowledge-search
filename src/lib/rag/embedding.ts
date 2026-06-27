/**
 * Generates vector embeddings for a given text using the Google Gemini Embedding API.
 * Uses the latest `text-embedding-004` model (768 dimensions).
 */

const queryEmbeddingCache = new Map<string, number[]>();

function setCacheWithEviction(key: string, value: number[]): void {
  if (queryEmbeddingCache.size >= 500) {
    const firstKey = queryEmbeddingCache.keys().next().value;
    if (firstKey !== undefined) queryEmbeddingCache.delete(firstKey);
  }
  queryEmbeddingCache.set(key, value);
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY environment variable. Please configure it in your environment or .env.local file.");
  }

  const cleanText = text.replace(/\n+/g, " ").trim();
  if (!cleanText) {
    return new Array(768).fill(0);
  }

  // Check in-memory cache
  if (queryEmbeddingCache.has(cleanText)) {
    return queryEmbeddingCache.get(cleanText)!;
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "models/gemini-embedding-001",
      content: {
        parts: [{ text: cleanText }],
      },
      outputDimensionality: 768,
      taskType: "RETRIEVAL_QUERY"
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Embedding API failed: ${response.statusText} (${response.status}) - ${errorText}`);
  }

  const data = await response.json();
  const values = data.embedding?.values;

  if (!values || !Array.isArray(values)) {
    throw new Error(`Invalid response format from Gemini Embedding API: ${JSON.stringify(data)}`);
  }

  // Cache result
  setCacheWithEviction(cleanText, values);
  return values;
}

/**
 * Generates vector embeddings for multiple texts concurrently in batches of up to 100
 * using the Gemini batchEmbedContents endpoint.
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY environment variable.");
  }

  const cleanTexts = texts.map((t) => t.replace(/\n+/g, " ").trim());
  const results: number[][] = new Array(cleanTexts.length);

  // Identify indices needing API calls (filter out empty texts and check cache)
  const pendingIndices: number[] = [];
  const pendingRequests: { model: string; content: { parts: { text: string }[] }; outputDimensionality: number; taskType: string }[] = [];

  for (let i = 0; i < cleanTexts.length; i++) {
    const text = cleanTexts[i];
    if (!text) {
      results[i] = new Array(768).fill(0);
    } else if (queryEmbeddingCache.has(text)) {
      results[i] = queryEmbeddingCache.get(text)!;
    } else {
      pendingIndices.push(i);
      pendingRequests.push({
        model: "models/gemini-embedding-001",
        content: {
          parts: [{ text }],
        },
        outputDimensionality: 768,
        taskType: "RETRIEVAL_DOCUMENT",
      });
    }
  }

  if (pendingRequests.length === 0) {
    return results;
  }

  const batchSize = 100;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${apiKey}`;

  // Execute in partition chunks of 100
  for (let offset = 0; offset < pendingRequests.length; offset += batchSize) {
    const chunkRequests = pendingRequests.slice(offset, offset + batchSize);
    const chunkIndices = pendingIndices.slice(offset, offset + batchSize);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: chunkRequests,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini Batch Embedding API failed: ${response.statusText} (${response.status}) - ${errorText}`);
    }

    const data = await response.json();
    const embeddings = data.embeddings;

    if (!embeddings || !Array.isArray(embeddings) || embeddings.length !== chunkRequests.length) {
      throw new Error("Invalid response format from Gemini Batch Embedding API");
    }

    for (let i = 0; i < embeddings.length; i++) {
      const values = embeddings[i]?.values;
      if (!values || !Array.isArray(values)) {
        throw new Error("Invalid embedding value returned from batch endpoint");
      }

      const originalIndex = chunkIndices[i];
      const text = cleanTexts[originalIndex];

      setCacheWithEviction(text, values);
      results[originalIndex] = values;
    }
  }

  return results;
}
