import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
// Initialize the worker in Next.js environment
import "pdfjs-dist/legacy/build/pdf.worker.mjs";

export interface RawParsedPage {
  pageNumber: number;
  rawText: string;
}

export interface RawPDFParseResult {
  totalPages: number;
  pages: RawParsedPage[];
}

/**
 * Extracts raw page-by-page text from a PDF ArrayBuffer using pdfjs-dist.
 * Performs validation checks and throws human-readable errors for passwords,
 * corruption, and empty files.
 */
export async function parsePDF(arrayBuffer: ArrayBuffer): Promise<RawPDFParseResult> {
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    throw new Error("The PDF file is empty or missing data.");
  }

  const data = new Uint8Array(arrayBuffer);
  let pdfDoc;

  try {
    const loadingTask = pdfjsLib.getDocument({
      data,
      useSystemFonts: true,
      disableFontFace: true,
    });
    pdfDoc = await loadingTask.promise;
  } catch (err) {
    console.error("[PDF Parser] Document load rejection:", err);

    const pdfError = err as { name?: string; message?: string };
    const errName = pdfError?.name;
    if (errName === "PasswordException") {
      throw new Error("PDF is password-protected. Please remove the password and try again.");
    }
    if (errName === "InvalidPDFException" || errName === "FormatError" || pdfError?.message?.includes("corrupted")) {
      throw new Error("The PDF file appears to be corrupted or invalid.");
    }
    if (errName === "MissingPDFException") {
      throw new Error("The PDF file is empty or missing.");
    }
    throw new Error(`Failed to load PDF document: ${pdfError?.message || "Unknown parsing issue"}`);
  }

  const numPages = pdfDoc.numPages;
  if (numPages === 0) {
    throw new Error("The PDF contains no pages.");
  }

  const pages: RawParsedPage[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    try {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      const pageText = textContent.items
        .map((item) => {
          const textItem = item as { str?: string };
          return textItem.str ?? "";
        })
        .join(" ");
        
      pages.push({
        pageNumber: pageNum,
        rawText: pageText,
      });
    } catch (err) {
      console.error(`[PDF Parser] Error parsing page ${pageNum}:`, err);
      const pageError = err as { message?: string };
      throw new Error(`Failed to parse PDF page ${pageNum}: ${pageError?.message || "Unknown error"}`);
    }
  }

  // Validate that the document contains at least some readable text characters
  const overallLength = pages.reduce((acc, p) => acc + p.rawText.trim().length, 0);
  if (overallLength === 0) {
    throw new Error("The PDF contains no readable text.");
  }

  return {
    totalPages: numPages,
    pages,
  };
}
