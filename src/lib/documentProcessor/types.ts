export interface ProcessedPage {
  pageNumber: number;
  characterCount: number;
  extractedText: string;
}

export interface DocumentProcessingResult {
  totalPages: number;
  totalCharacters: number;
  pages: ProcessedPage[];
}
