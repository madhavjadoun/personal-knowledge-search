export interface RetrievalConfig {
  topK: number;                     // Number of results to return (3, 5, 10)
  similarityThreshold: number;      // Minimum cosine similarity [0.0 – 1.0]
  filterDocumentId?: string;        // Optional: restrict search to one document
}

export type ConfidenceLevel = "High" | "Medium" | "Low";

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  pageStart: number;
  pageEnd: number;
  chunkIndex: number;
  similarityScore: number;
  confidence: ConfidenceLevel;      // Derived from similarity score
  characterCount: number;
  preview: string;                  // First 200 chars
  fullText: string;
}

export interface RetrievalResult {
  query: string;
  provider: string;
  model: string;
  embeddingTimeMs: number;
  searchTimeMs: number;
  totalTimeMs: number;
  returnedChunks: number;
  averageSimilarity: number;
  confidence: ConfidenceLevel;      // Overall confidence for the result set
  results: RetrievedChunk[];
}

export interface RetrievalError {
  code:
    | "EMPTY_QUERY"
    | "QUERY_TOO_LONG"
    | "PROVIDER_UNAVAILABLE"
    | "EMBEDDING_FAILED"
    | "NO_EMBEDDINGS_FOUND"
    | "DOCUMENT_NOT_EMBEDDED"
    | "NO_MATCHING_CHUNKS"
    | "OUT_OF_DOMAIN"
    | "SEARCH_FAILED";
  message: string;
}
