export interface DocumentStats {
  totalPages: number;
  totalChunks: number;
  averageChunkSize: number;
  characterCount: number;
  estimatedReadingTimeMin: number;
}

export interface QuestionDetection {
  isQuestionOriented: boolean;
  approximateTotalQuestions: number | "Not Applicable";
  questionNumbers: number[];
  questionPattern: string; // e.g. "Q1, Q2...", "Numbered list", "Not Applicable"
}

export interface ConceptItem {
  name: string;
  category: "Algorithm" | "Framework" | "Model" | "Definition" | "Technique" | "Formula" | "Library" | "Other";
  description: string;
}

export interface DocumentIntelligence {
  documentId: string;
  title: string;
  summary: string; // Max 300 words document-level summary
  topics: string[]; // List of unique major topics
  concepts: ConceptItem[]; // Important extracted concepts
  stats: DocumentStats;
  questions: QuestionDetection;
  metadata: {
    language: string;
    documentType: string; // e.g. "Research Paper", "Viva Questions", "Lecture Slides", etc.
    createdTime: string;
    processingTimeMs: number;
  };
}
