import { createLLMProvider } from "../answerEngine/providers";
import { DocumentIntelligence, DocumentStats } from "./types";
import { generateSummary } from "./summaryGenerator";
import { extractTopicsAndConcepts } from "./topicExtractor";
import { generateMetadataAndQuestions } from "./metadataGenerator";

interface ParsedDoc {
  totalPages: number;
  totalCharacters: number;
  pages: { pageNumber: number; characterCount: number; extractedText: string }[];
}

interface LocalChunk {
  pageStart: number;
  pageEnd: number;
  text: string;
}

/**
 * Samples a document page-by-page to fit within LLM context window constraints.
 */
function getRepresentativeSample(pages: ParsedDoc["pages"]): string {
  const fullText = pages.map((p) => p.extractedText).join("\n\n");
  if (fullText.length <= 12000) {
    return fullText;
  }

  const firstPage = pages[0]?.extractedText || "";
  const lastPage = pages[pages.length - 1]?.extractedText || "";

  let middleText = "";
  if (pages.length > 2) {
    const midIdx = Math.floor(pages.length / 2);
    middleText = pages[midIdx]?.extractedText || "";
  }

  const sampleIntro = firstPage.slice(0, 4000);
  const sampleBody = middleText.slice(0, 4000);
  const sampleOutro = lastPage.slice(0, 4000);

  return [
    "--- DOCUMENT INTRODUCTION & HEADER ---",
    sampleIntro,
    "--- DOCUMENT SAMPLE BODY ---",
    sampleBody,
    "--- DOCUMENT CONCLUSION & REFERENCE ---",
    sampleOutro,
  ].join("\n\n");
}

/**
 * Orchestrates summary, topic/concept extraction, statistics, and metadata generation.
 */
export async function generateDocumentIntelligence(
  documentId: string,
  title: string,
  parsedDoc: ParsedDoc,
  chunks: LocalChunk[]
): Promise<DocumentIntelligence> {
  const startTime = Date.now();
  console.log(`[DocIntel] Generating intelligence for document: ${title} (${documentId})`);

  const llmProvider = createLLMProvider();

  // 1. Text sampling
  const sampleText = getRepresentativeSample(parsedDoc.pages);
  const fullText = parsedDoc.pages.map((p) => p.extractedText).join("\n\n");

  // 2. Parallel LLM generation tasks (using provider-agnostic factory)
  const [summary, topicResult, metaResult] = await Promise.all([
    generateSummary(sampleText, llmProvider),
    extractTopicsAndConcepts(sampleText, llmProvider),
    generateMetadataAndQuestions(sampleText, llmProvider, fullText),
  ]);

  // 3. Document statistics calculation
  const totalPages = parsedDoc.pages.length || 1;
  const totalChunks = chunks.length || 1;
  const characterCount = parsedDoc.totalCharacters || sampleText.length;
  const averageChunkSize = Math.round(
    chunks.reduce((acc, c) => acc + c.text.length, 0) / totalChunks
  );
  // Estimate reading time: 1 token ~ 4 chars; avg adult reads 200 WPM
  const wordCount = Math.ceil(characterCount / 4);
  const estimatedReadingTimeMin = Math.max(Math.ceil(wordCount / 200), 1);

  const stats: DocumentStats = {
    totalPages,
    totalChunks,
    averageChunkSize,
    characterCount,
    estimatedReadingTimeMin,
  };

  const processingTimeMs = Date.now() - startTime;

  return {
    documentId,
    title,
    summary,
    topics: topicResult.topics,
    concepts: topicResult.concepts,
    stats,
    questions: metaResult.questions,
    metadata: {
      language: metaResult.language,
      documentType: metaResult.documentType,
      createdTime: new Date().toISOString(),
      processingTimeMs,
    },
  };
}
