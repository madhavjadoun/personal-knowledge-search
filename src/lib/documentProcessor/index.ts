import { parsePDF } from "./pdfParser";
import { normalizeText } from "./normalizer";
import { DocumentProcessingResult, ProcessedPage } from "./types";

export * from "./types";
export * from "./normalizer";
export * from "./pdfParser";

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
    
    processedPages.push({
      pageNumber: rawPage.pageNumber,
      characterCount: charCount,
      extractedText: normalizedText,
    });
    
    totalCharacters += charCount;
    
    console.log(
      `[DocumentProcessor] Processed Page ${rawPage.pageNumber}: ${charCount} characters (normalized)`
    );
  }

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
  };
}
