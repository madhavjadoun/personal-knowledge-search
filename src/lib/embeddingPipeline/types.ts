export interface EmbeddingProvider {
  name: string;
  modelName: string;
  embed(text: string, taskType?: "query" | "document"): Promise<number[]>;
  embedBatch(texts: string[], taskType?: "query" | "document"): Promise<number[][]>;
}

export interface EmbeddingResult {
  chunkId: string;
  documentId: string;
  embedding: number[];
  dimensions: number;
  model: string;
  generatedAt: string;
  retryCount: number;
}

export interface ChunkInput {
  chunkId: string;
  documentId: string;
  text: string;
  pageStart: number;
  pageEnd: number;
  chunkIndex: number;
}
