import { parsePDF } from "./pdfParser";
import { normalizeText } from "./normalizer";
import { DocumentProcessingResult, ProcessedPage } from "./types";
import { analyzeDocument } from "./analyzer";
import { parsePageToBlocks } from "./structuredParser";

export * from "./types";
export * from "./normalizer";
export * from "./pdfParser";
export * from "./analyzer";
export * from "./structuredParser";

/**
 * Orchestrates the full document processing pipeline:
 * 1. Parses raw page-by-page text from the PDF buffer.
 * 2. Normalizes the extracted text for clean downstream usage.
 * 3. Builds structural metadata for each page.
 * 4. Logs diagnostics for operational traceability.
 */
export async function processDocument(arrayBuffer: ArrayBuffer): Promise<DocumentProcessingResult> {
  const startTime = Date.now();
  console.log("[DocumentProcessor] Starting document processing pipeline...");

  const rawResult = await parsePDF(arrayBuffer);
  
  const processedPages: ProcessedPage[] = [];
  let totalCharacters = 0;

  for (const rawPage of rawResult.pages) {
    const normalizedText = normalizeText(rawPage.rawText);
    const charCount = normalizedText.length;
    const blocks = parsePageToBlocks(normalizedText);
    
    processedPages.push({
      pageNumber: rawPage.pageNumber,
      characterCount: charCount,
      extractedText: normalizedText,
      blocks,
    });
    
    totalCharacters += charCount;
    
    console.log(
      `[DocumentProcessor] Processed Page ${rawPage.pageNumber}: ${charCount} characters (normalized)`
    );
  }

  // Pre-build temporary DocumentProcessingResult to feed to analyzer
  const tempResult: DocumentProcessingResult = {
    totalPages: rawResult.totalPages,
    totalCharacters,
    pages: processedPages,
  };

  // Run Adaptive Document Analyzer immediately after text extraction
  console.log("[DocumentProcessor] Executing Adaptive Document Structure Analyzer (Phase 1)...");
  const documentAnalysis = analyzeDocument(tempResult);
  console.log("[DocumentProcessor] Structure analysis completed successfully.");

  const durationMs = Date.now() - startTime;
  console.log("=== [DOCUMENT PROCESSING COMPLETED] ===");
  console.log(`- Total Pages: ${rawResult.totalPages}`);
  console.log(`- Total Characters: ${totalCharacters}`);
  console.log(`- Execution Latency: ${durationMs}ms`);
  console.log("=======================================");

  return {
    totalPages: rawResult.totalPages,
    totalCharacters,
    pages: processedPages,
    documentAnalysis,
  };
}
