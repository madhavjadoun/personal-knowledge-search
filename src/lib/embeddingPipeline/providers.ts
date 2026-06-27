import { EmbeddingProvider } from "./types";

// Global cached flags to limit redundant console logs
let hasLoggedGoogle = false;
let hasLoggedOllama = false;

/**
 * Google Embedding Provider using Gemini text-embedding-004 REST endpoints.
 */
class GoogleEmbeddingProvider implements EmbeddingProvider {
  name = "google";
  modelName: string;
  private apiKey: string;

  constructor() {
    this.modelName = process.env.GOOGLE_EMBEDDING_MODEL || "text-embedding-004";
    
    // Read and validate API Key only when Google is initialized
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY");
    }
    this.apiKey = apiKey;

    if (!hasLoggedGoogle) {
      console.log(`Selected Provider: Google`);
      console.log(`Selected Model: ${this.modelName}`);
      hasLoggedGoogle = true;
    }
  }

  async embed(text: string, taskType?: "query" | "document"): Promise<number[]> {
    const apiKey = this.apiKey;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:embedContent?key=${apiKey}`;

    const cleanText = text.replace(/\s+/g, " ").trim();
    if (!cleanText) {
      throw new Error("Cannot embed empty text.");
    }

    const gTaskType = taskType === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT";

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${this.modelName}`,
        content: { parts: [{ text: cleanText }] },
        taskType: gTaskType,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google embedding failed: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const values = data.embedding?.values;

    if (!values || !Array.isArray(values)) {
      throw new Error(`Google embedding API returned an unexpected response format. Model: ${this.modelName}`);
    }

    return values;
  }

  async embedBatch(texts: string[], taskType?: "query" | "document"): Promise<number[][]> {
    if (texts.length === 0) return [];
    
    const apiKey = this.apiKey;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:batchEmbedContents?key=${apiKey}`;

    const gTaskType = taskType === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT";

    const requests = texts.map((t) => ({
      model: `models/${this.modelName}`,
      content: { parts: [{ text: t.replace(/\s+/g, " ").trim() || " " }] },
      taskType: gTaskType,
    }));

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google batch embedding failed: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const embeddings = data.embeddings;

    if (!embeddings || !Array.isArray(embeddings)) {
      throw new Error(`Google batch embedding API returned an unexpected response format. Model: ${this.modelName}`);
    }

    return embeddings.map((e) => (e as { values?: number[] }).values || []);
  }
}

/**
 * Ollama Embedding Provider using local HTTP REST endpoints.
 */
class OllamaEmbeddingProvider implements EmbeddingProvider {
  name = "ollama";
  modelName: string;
  baseUrl: string;

  constructor() {
    this.modelName = process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text";
    
    // Read and validate Base URL only when Ollama is initialized
    const baseUrl = process.env.OLLAMA_BASE_URL;
    if (!baseUrl) {
      throw new Error("Missing OLLAMA_BASE_URL");
    }
    this.baseUrl = baseUrl.replace(/\/$/, "");

    if (!hasLoggedOllama) {
      console.log(`Selected Provider: Ollama`);
      console.log(`Selected Model: ${this.modelName}`);
      hasLoggedOllama = true;
    }
  }

  async embed(text: string, taskType?: "query" | "document"): Promise<number[]> {
    let cleanText = text.replace(/\s+/g, " ").trim();
    if (!cleanText) {
      throw new Error("Cannot embed empty text.");
    }

    // Prefix for nomic-embed-text if applicable (required for nomic RAG accuracy)
    if (this.modelName.includes("nomic-embed-text")) {
      const prefix = taskType === "query" ? "search_query: " : "search_document: ";
      cleanText = prefix + cleanText;
    }

    const endpoint = `${this.baseUrl}/api/embeddings`;
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.modelName,
          prompt: cleanText,
        }),
      });
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed") || msg.includes("Failed to fetch")) {
        throw new Error(`Ollama server is not running. Start it with: ollama serve (tried ${this.baseUrl})`);
      }
      throw new Error(`Ollama connection error: ${msg}`);
    }

    if (response.status === 404) {
      throw new Error(`Embedding model '${this.modelName}' is not installed. Run: ollama pull ${this.modelName}`);
    }
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama embedding failed: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const embedding = data.embedding;

    if (!embedding || !Array.isArray(embedding)) {
      throw new Error(`Ollama embedding API returned an unexpected response format. Model: ${this.modelName}`);
    }

    return embedding;
  }

  async embedBatch(texts: string[], taskType?: "query" | "document"): Promise<number[][]> {
    if (texts.length === 0) return [];

    const formattedTexts = texts.map((t) => {
      let clean = t.replace(/\s+/g, " ").trim() || " ";
      if (this.modelName.includes("nomic-embed-text")) {
        const prefix = taskType === "query" ? "search_query: " : "search_document: ";
        clean = prefix + clean;
      }
      return clean;
    });

    // Attempt Ollama batch embed API if supported (/api/embed)
    try {
      const endpoint = `${this.baseUrl}/api/embed`;
      let batchResponse: Response;
      try {
        batchResponse = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: this.modelName,
            input: formattedTexts,
          }),
        });
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed") || msg.includes("Failed to fetch")) {
          throw new Error(`Ollama server is not running. Start it with: ollama serve (tried ${this.baseUrl})`);
        }
        throw fetchErr;
      }

      if (batchResponse.ok) {
        const data = await batchResponse.json();
        if (data.embeddings && Array.isArray(data.embeddings)) {
          return data.embeddings;
        }
      } else if (batchResponse.status === 404) {
        throw new Error(`Embedding model '${this.modelName}' is not installed. Run: ollama pull ${this.modelName}`);
      }
    } catch (e) {
      // Re-throw actionable errors (server not running, model missing)
      if (e instanceof Error && (e.message.includes("not running") || e.message.includes("not installed"))) {
        throw e;
      }
      console.warn("[Ollama Provider] /api/embed batch call failed, falling back to parallel /api/embeddings prompts:", e);
    }

    // Fallback: execute prompt embeddings in parallel
    const promises = texts.map((t) => this.embed(t, taskType));
    return Promise.all(promises);
  }
}

/**
 * Factory function to retrieve the configured EmbeddingProvider instance.
 * Evaluates EMBEDDING_PROVIDER first, then instantiates the chosen provider.
 */
export function createEmbeddingProvider(): EmbeddingProvider {
  const provider = (process.env.EMBEDDING_PROVIDER || "google").toLowerCase();
  
  if (provider === "google") {
    return new GoogleEmbeddingProvider();
  } else if (provider === "ollama") {
    return new OllamaEmbeddingProvider();
  } else {
    throw new Error(`Unsupported EMBEDDING_PROVIDER value: '${provider}'. Must be 'google' or 'ollama'.`);
  }
}
