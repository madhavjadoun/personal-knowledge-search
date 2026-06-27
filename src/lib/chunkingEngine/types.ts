export interface ChunkConfig {
  maxChunkCharacters: number;
  overlapCharacters: number;
}

export interface Chunk {
  chunkId: string; // Deterministic SHA-256 hash of documentId + chunkIndex
  documentId: string;
  pageStart: number;
  pageEnd: number;
  chunkIndex: number;
  text: string;
  characterCount: number;
}

export interface ChunkingResult {
  totalChunks: number;
  averageChunkSize: number;
  largestChunkSize: number;
  smallestChunkSize: number;
  chunks: Chunk[];
}
