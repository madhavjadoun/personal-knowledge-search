import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import "pdfjs-dist/legacy/build/pdf.worker.mjs";

export interface RawParsedPage {
  pageNumber: number;
  rawText: string;
}

export interface RawPDFParseResult {
  totalPages: number;
  pages: RawParsedPage[];
}

interface PdfTextItem {
  str: string;
  dir: string;
  width: number;
  height: number;
  transform: number[];
  fontName: string;
}

function parsePageItemsToLines(items: unknown[]): string {
  const textItems = items.filter(
    (item): item is PdfTextItem => {
      if (!item || typeof item !== "object") return false;
      const obj = item as Record<string, unknown>;
      return typeof obj.str === "string" && Array.isArray(obj.transform);
    }
  );

  if (textItems.length === 0) return "";

  const sortedItems = [...textItems].sort((a, b) => {
    const yDiff = b.transform[5] - a.transform[5];
    if (Math.abs(yDiff) > 5) {
      return yDiff;
    }
    return a.transform[4] - b.transform[4];
  });

  const lines: { y: number; items: PdfTextItem[] }[] = [];
  for (const item of sortedItems) {
    const y = item.transform[5];
    let foundLine = lines.find(l => Math.abs(l.y - y) <= 5);
    if (!foundLine) {
      foundLine = { y, items: [] };
      lines.push(foundLine);
    }
    foundLine.items.push(item);
  }

  lines.sort((a, b) => b.y - a.y);

  const formattedLines: string[] = [];
  for (const line of lines) {
    line.items.sort((a, b) => a.transform[4] - b.transform[4]);

    let lineStr = "";
    for (let idx = 0; idx < line.items.length; idx++) {
      const item = line.items[idx];
      const text = item.str || "";
      if (idx === 0) {
        lineStr = text;
      } else {
        const prevItem = line.items[idx - 1];
        const gap = item.transform[4] - (prevItem.transform[4] + prevItem.width);
        if (gap > 12) {
          lineStr += " | " + text;
        } else {
          if (gap > 1) {
            lineStr += " " + text;
          } else {
            lineStr += text;
          }
        }
      }
    }
    formattedLines.push(lineStr.trim());
  }

  return formattedLines.join("\n");
}

function convertPageTablesToMarkdown(pageText: string): string {
  const lines = pageText.split("\n");
  const resultLines: string[] = [];

  let inTable = false;
  let tableLines: string[] = [];

  const flushTable = () => {
    if (tableLines.length === 0) return;

    const formatted: string[] = [];
    let maxCols = 0;

    const splitLines = tableLines.map(line => {
      const parts = line.split(" | ").map(p => p.trim());
      if (parts.length > maxCols) {
        maxCols = parts.length;
      }
      return parts;
    });

    if (maxCols > 1) {
      const header = splitLines[0];
      while (header.length < maxCols) header.push("");
      formatted.push("| " + header.join(" | ") + " |");

      const delimiter = Array(maxCols).fill("---");
      formatted.push("| " + delimiter.join(" | ") + " |");

      for (let i = 1; i < splitLines.length; i++) {
        const row = splitLines[i];
        while (row.length < maxCols) row.push("");
        formatted.push("| " + row.join(" | ") + " |");
      }

      resultLines.push(...formatted);
    } else {
      resultLines.push(...tableLines);
    }

    tableLines = [];
    inTable = false;
  };

  for (const line of lines) {
    const normalizedLine = line.replace(/\t+/g, " | ");
    const isTableLine = normalizedLine.includes(" | ");

    if (isTableLine) {
      inTable = true;
      tableLines.push(normalizedLine);
    } else {
      if (inTable) {
        flushTable();
      }
      resultLines.push(line);
    }
  }

  if (inTable) {
    flushTable();
  }

  return resultLines.join("\n");
}

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
      const pageText = parsePageItemsToLines(textContent.items);
      const tableFormattedText = convertPageTablesToMarkdown(pageText);

      pages.push({
        pageNumber: pageNum,
        rawText: tableFormattedText,
      });
    } catch (err) {
      console.error(`[PDF Parser] Error parsing page ${pageNum}:`, err);
      const pageError = err as { message?: string };
      throw new Error(`Failed to parse PDF page ${pageNum}: ${pageError?.message || "Unknown error"}`);
    }
  }

  // Scanned PDF detection — OCR disabled (canvas not available in this environment)
  // If text is too short, log warning and continue with what was extracted
  const overallLength = pages.reduce((acc, p) => acc + p.rawText.trim().length, 0);
  if (overallLength < 50) {
    console.warn(
      `[PDF Parser] Very short text extracted (${overallLength} chars). ` +
      `This may be a scanned PDF. OCR is disabled — returning extracted text as-is.`
    );
  }

  return {
    totalPages: numPages,
    pages,
  };
}