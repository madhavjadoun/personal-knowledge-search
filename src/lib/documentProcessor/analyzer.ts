import { DocumentProcessingResult, DocumentAnalysis, PageAnalysis, RegionAnalysis } from "./types";

function detectHeading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;
  if (/^\s*#\s+/.test(trimmed)) return true;
  if (/^\s*(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)\.\s+[A-Z]/.test(trimmed)) return true;
  if (/^\s*\d+\s+[A-Z]/.test(trimmed)) return true;
  if (trimmed.length > 0 && trimmed.length < 60 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) {
    if (/^\s*([\-\*\u2022\+]|\d+[\.\)])/.test(trimmed)) return false;
    return true;
  }
  return false;
}

function detectSubheading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;
  if (/^\s*#{2,}\s+/.test(trimmed)) return true;
  if (/^\s*\d+\.\d+(\.\d+)*\s+[A-Z]/.test(trimmed)) return true;
  return false;
}

function detectQuestion(line: string): boolean {
  const trimmed = line.trim();
  return /^\s*(Q\d+|Question\s*\d+|Q\s*:|\[Q\d+\])/i.test(trimmed);
}

function detectBullet(line: string): boolean {
  const trimmed = line.trim();
  return /^\s*([\-\*\u2022]|\+\s)\s+/.test(trimmed);
}

function detectNumberedList(line: string): boolean {
  const trimmed = line.trim();
  return /^\s*\d+[\.\)]\s+/.test(trimmed);
}

export function analyzeDocument(doc: DocumentProcessingResult): DocumentAnalysis {
  const pages: PageAnalysis[] = [];

  for (const page of doc.pages) {
    const regions: RegionAnalysis[] = [];
    
    if (page.blocks && page.blocks.length > 0) {
      let currentRegionType: RegionAnalysis["type"] | null = null;
      let currentRegionContent: string[] = [];

      const flushRegion = () => {
        if (currentRegionType !== null && currentRegionContent.length > 0) {
          const joinChar = currentRegionType === "table" ? "\n\n" : "\n";
          regions.push({
            type: currentRegionType,
            content: currentRegionContent.join(joinChar).trim()
          });
        }
        currentRegionType = null;
        currentRegionContent = [];
      };

      for (const block of page.blocks) {
        let blockType: RegionAnalysis["type"] = "paragraph";
        if (block.type === "table_row") {
          blockType = "table";
        } else if (block.type === "heading") {
          blockType = "heading";
        } else if (block.type === "subheading") {
          blockType = "subheading";
        } else if (block.type === "questions") {
          blockType = "questions";
        } else if (block.type === "bullet_list") {
          blockType = "bullet_list";
        } else if (block.type === "mixed") {
          blockType = "mixed";
        }

        if (currentRegionType === null) {
          currentRegionType = blockType;
          currentRegionContent.push(block.text);
        } else if (currentRegionType === blockType) {
          if (blockType === "heading" || blockType === "subheading") {
            flushRegion();
            currentRegionType = blockType;
            currentRegionContent.push(block.text);
          } else {
            currentRegionContent.push(block.text);
          }
        } else {
          flushRegion();
          currentRegionType = blockType;
          currentRegionContent.push(block.text);
        }
      }
      flushRegion();
    } else {
      if (!page.extractedText || page.extractedText.trim().length === 0) {
        pages.push({ page: page.pageNumber, regions });
        continue;
      }

      const lines = page.extractedText.split("\n");
      let currentRegionType: RegionAnalysis["type"] | null = null;
      let currentRegionContent: string[] = [];

      const flushRegion = () => {
        if (currentRegionType !== null && currentRegionContent.length > 0) {
          regions.push({
            type: currentRegionType,
            content: currentRegionContent.join("\n").trim()
          });
        }
        currentRegionType = null;
        currentRegionContent = [];
      };

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;

        let lineType: RegionAnalysis["type"] = "paragraph";

        if (trimmed.includes("|")) {
          lineType = "table";
        } else if (detectQuestion(trimmed)) {
          lineType = "questions";
        } else if (detectHeading(trimmed)) {
          lineType = "heading";
        } else if (detectSubheading(trimmed)) {
          lineType = "subheading";
        } else if (detectBullet(trimmed)) {
          lineType = "bullet_list";
        } else if (detectNumberedList(trimmed)) {
          lineType = "bullet_list";
        }

        if (currentRegionType === null) {
          currentRegionType = lineType;
          currentRegionContent.push(trimmed);
        } else if (currentRegionType === lineType) {
          if (lineType === "heading" || lineType === "subheading") {
            flushRegion();
            currentRegionType = lineType;
            currentRegionContent.push(trimmed);
          } else {
            currentRegionContent.push(trimmed);
          }
        } else {
          flushRegion();
          currentRegionType = lineType;
          currentRegionContent.push(trimmed);
        }
      }
      flushRegion();
    }

    pages.push({
      page: page.pageNumber,
      regions
    });
  }

  return { pages };
}
