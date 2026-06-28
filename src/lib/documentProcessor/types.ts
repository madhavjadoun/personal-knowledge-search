export interface RegionAnalysis {
  type: "heading" | "subheading" | "paragraph" | "questions" | "bullet_list" | "table" | "mixed";
  content: string;
}

export interface PageAnalysis {
  page: number;
  regions: RegionAnalysis[];
}

export interface DocumentAnalysis {
  pages: PageAnalysis[];
}

export interface StructuredBlock {
  type: "heading" | "subheading" | "paragraph" | "questions" | "bullet_list" | "table_row" | "mixed";
  text: string;
  topic?: string;
}

export interface ProcessedPage {
  pageNumber: number;
  characterCount: number;
  extractedText: string;
  blocks?: StructuredBlock[];
}

export interface DocumentProcessingResult {
  totalPages: number;
  totalCharacters: number;
  pages: ProcessedPage[];
  documentAnalysis?: DocumentAnalysis;
}
