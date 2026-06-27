import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import 'pdfjs-dist/legacy/build/pdf.worker.mjs';

export interface PDFParseResult {
  text: string;
  pages: number;
  pageTexts: string[];
  emptyPages: number[];
}

/**
 * Parses a PDF file from an ArrayBuffer page-by-page.
 * Returns the full concatenated text, total page count, and pageTexts array.
 */
export async function parsePDF(arrayBuffer: ArrayBuffer): Promise<PDFParseResult> {
  const data = new Uint8Array(arrayBuffer);
  
  // Use legacy pdfjs build configuration
  const loadingTask = pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
  });

  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    try {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      const yGroups: Record<number, { str?: string; transform?: number[] }[]> = {};
      for (const item of textContent.items) {
        const textItem = item as { str?: string; transform?: number[] };
        const y = textItem.transform && textItem.transform.length >= 6 ? Math.round(textItem.transform[5]) : 0;
        if (!yGroups[y]) {
          yGroups[y] = [];
        }
        yGroups[y].push(textItem);
      }

      const sortedYKeys = Object.keys(yGroups)
        .map(Number)
        .sort((a, b) => b - a);

      const lines = sortedYKeys.map((y) => {
        const itemsInGroup = yGroups[y];
        itemsInGroup.sort((a, b) => {
          const xA = a.transform && a.transform.length >= 5 ? a.transform[4] : 0;
          const xB = b.transform && b.transform.length >= 5 ? b.transform[4] : 0;
          return xA - xB;
        });
        return itemsInGroup.map((textItem) => textItem.str ?? '').join(' ');
      });

      const pageText = lines.join('\n');
        
      pageTexts.push(pageText.trim());
    } catch (err) {
      console.error(`[PDF Parser] Error parsing page ${pageNum}:`, err);
      pageTexts.push('');
    }
  }

  const emptyPages = pageTexts.map((t, i) => t.trim() === "" ? i + 1 : null).filter(Boolean) as number[];
  if (emptyPages.length > 0) {
    console.warn(
      `[PDF Parser] ${emptyPages.length} page(s) had no extractable text (possibly scanned images): pages ${emptyPages.join(", ")}. ` +
      `These pages will be skipped. Consider running OCR on the PDF first.`
    );
  }

  const fullText = pageTexts.join('\n\n');

  return {
    text: fullText,
    pages: numPages,
    pageTexts,
    emptyPages: emptyPages as number[],
  };
}
