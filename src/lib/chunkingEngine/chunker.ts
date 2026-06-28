import { createHash } from "crypto";
import { DocumentProcessingResult, RegionAnalysis } from "../documentProcessor/types";
import { Chunk, ChunkConfig, ChunkingResult } from "./types";

interface TextUnit {
  text: string;
  topic: string;
}

interface RawChunkInput {
  text: string;
  pageStart: number;
  pageEnd: number;
  topic: string;
  isTableRowChunk: boolean;
}

/**
 * Splits text into a list of sentences, keeping the punctuation at the end of each.
 * If no punctuation is found, returns the trimmed text in a single-item array.
 */
function splitIntoSentences(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/[^.!?]+[.!?]+(?=\s|$)/g);
  if (!matches) {
    return [text.trim()];
  }
  return matches.map(m => m.trim()).filter(Boolean);
}

/**
 * Helper to extract special topics (arrays, searching, sorting, recursion) from text.
 */
function getBlockSpecialTopics(text: string): Set<"arrays" | "searching" | "sorting" | "recursion"> {
  const lower = text.toLowerCase();
  const topics = new Set<"arrays" | "searching" | "sorting" | "recursion">();
  
  if (/\b(array|arrays)\b/.test(lower)) {
    topics.add("arrays");
  }
  if (/\b(search|searching|searched)\b/.test(lower)) {
    topics.add("searching");
  }
  if (/\b(sort|sorting|sorted)\b/.test(lower)) {
    topics.add("sorting");
  }
  if (/\b(recursion|recursive|recursively)\b/.test(lower)) {
    topics.add("recursion");
  }
  
  return topics;
}

/**
 * Detects topic boundaries using explicit patterns or core CS curriculum keywords.
 */
export function getTopicFromText(text: string): string | null {
  const lower = text.toLowerCase();

  const topics = [
    "dynamic programming",
    "linked list",
    "binary tree",
    "recursion",
    "arrays",
    "array",
    "strings",
    "string",
    "searching",
    "sorting",
    "stack",
    "queue",
    "tree",
    "graph",
    "hash",
    "heap",
    "greedy",
    "backtracking"
  ];

  for (const t of topics) {
    const regex = new RegExp(`\\b${t}\\b`, "i");
    if (regex.test(lower)) {
      return t;
    }
  }

  const prefixMatch = text.match(/\b(topic|section|unit)\s*:\s*([a-zA-Z0-9_\s]+)/i);
  if (prefixMatch && prefixMatch[2]) {
    return prefixMatch[2].trim().toLowerCase();
  }

  return null;
}

/**
 * Recognizes a new major topic or section boundary using prefix patterns or core CS topics.
 */
function hasNewTopicSignal(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  
  // 1. Prefix markers like Topic:, Chapter:, Section:, Unit:, Module:
  if (/^\s*(topic|chapter|section|unit|module)\s*:/i.test(trimmed)) {
    return true;
  }
  
  // 2. Core CS topics
  const topics = [
    "dynamic programming",
    "linked list",
    "binary tree",
    "recursion",
    "arrays",
    "array",
    "strings",
    "string",
    "searching",
    "sorting",
    "stack",
    "queue",
    "tree",
    "graph",
    "hash",
    "heap",
    "greedy",
    "backtracking"
  ];
  const lower = trimmed.toLowerCase();
  for (const t of topics) {
    const regex = new RegExp(`\\b${t}\\b`, "i");
    if (regex.test(lower)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Detects if a line is a heading.
 */
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

/**
 * Detects if a line is a subheading.
 */
function detectSubheading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;
  if (/^\s*#{2,}\s+/.test(trimmed)) return true;
  if (/^\s*\d+\.\d+(\.\d+)*\s+[A-Z]/.test(trimmed)) return true;
  return false;
}

/**
 * Detects if a line is a question.
 */
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

/**
 * Formats table cells using table headers into a clean, key-value structure.
 */
function formatTableRow(headers: string[], cells: string[]): { topic: string; formatted: string } {
  const trimmedCells = cells.map(c => c.trim());
  const topic = trimmedCells[0] || "General";
  const firstHeader = (headers[0] || "Topic").trim();
  
  let formatted = `${firstHeader}: ${topic}\n`;
  
  if (trimmedCells.length > 1) {
    const remainingHeaders = headers.slice(1).map(h => h.trim());
    const remainingCells = trimmedCells.slice(1);
    
    if (remainingHeaders.length === 1) {
      const headerName = remainingHeaders[0];
      formatted += `${headerName}:\n`;
      for (const cell of remainingCells) {
        if (cell) {
          formatted += `- ${cell}\n`;
        }
      }
    } else {
      for (let idx = 0; idx < remainingHeaders.length; idx++) {
        const headerName = remainingHeaders[idx];
        if (idx === remainingHeaders.length - 1) {
          formatted += `${headerName}:\n`;
          const finalCells = remainingCells.slice(idx);
          for (const cell of finalCells) {
            if (cell) {
              formatted += `- ${cell}\n`;
            }
          }
        } else {
          const cellVal = remainingCells[idx] || "";
          formatted += `${headerName}: ${cellVal}\n`;
        }
      }
    }
  }
  
  return { topic, formatted: formatted.trim() };
}

/**
 * Chunks continuous paragraphs using sentence-level logic.
 */
function chunkParagraphRegion(
  content: string,
  pageNum: number,
  overlapCharacters: number
): { text: string; topic: string }[] {
  const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
  const units: TextUnit[] = [];
  let activeTopic = "general";
  
  for (const line of lines) {
    const sentences = splitIntoSentences(line);
    for (const sentence of sentences) {
      const sentenceTopics = getBlockSpecialTopics(sentence);
      let sentenceTopic = activeTopic;
      if (sentenceTopics.size > 0) {
        sentenceTopic = Array.from(sentenceTopics)[0];
        activeTopic = sentenceTopic;
      }
      units.push({ text: sentence, topic: sentenceTopic });
    }
  }

  if (units.length === 0) return [];

  const paragraphChunks: { text: string; topic: string }[] = [];
  let i = 0;
  
  while (i < units.length) {
    const currentUnits: TextUnit[] = [];
    let currentLen = 0;
    const startIndex = i;
    let currentChunkTopic = units[i].topic;

    while (i < units.length) {
      const unit = units[i];
      const spaceNeeded = currentUnits.length > 0 ? 1 : 0;

      if (unit.text.length > 500) {
        if (currentUnits.length > 0) {
          break;
        }
        let remainingText = unit.text;
        while (remainingText.length > 0) {
          let splitLen = Math.min(450, remainingText.length);
          if (splitLen < remainingText.length) {
            const lastSpace = remainingText.lastIndexOf(" ", splitLen);
            if (lastSpace > Math.floor(450 * 0.6)) {
              splitLen = lastSpace;
            }
          }
          paragraphChunks.push({
            text: remainingText.substring(0, splitLen).trim(),
            topic: unit.topic
          });
          remainingText = remainingText.substring(splitLen).trim();
        }
        i++;
        continue;
      }

      if (currentUnits.length > 0) {
        const isSpecial = (t: string) => t !== "general" && t !== "";
        if (isSpecial(currentChunkTopic) && isSpecial(unit.topic) && currentChunkTopic !== unit.topic) {
          break;
        }

        if (currentLen + unit.text.length + spaceNeeded > 500) {
          break;
        }
        if (currentLen >= 250 && currentLen + unit.text.length + spaceNeeded > 450) {
          break;
        }
      }

      if (currentUnits.length === 0) {
        currentChunkTopic = unit.topic;
      } else if (currentChunkTopic === "general" && unit.topic !== "general") {
        currentChunkTopic = unit.topic;
      }

      currentUnits.push(unit);
      currentLen += unit.text.length + spaceNeeded;
      i++;
    }

    if (currentUnits.length > 0) {
      const chunkText = currentUnits.map((u) => u.text).join(" ");
      paragraphChunks.push({
        text: chunkText,
        topic: currentChunkTopic
      });

      if (i < units.length) {
        let backtrackLen = 0;
        let backtrackCount = 0;

        for (let j = i - 1; j >= startIndex; j--) {
          const prevUnit = units[j];
          if (prevUnit.topic !== units[i].topic) {
            break;
          }

          const unitLen = prevUnit.text.length;
          const space = backtrackCount > 0 ? 1 : 0;
          const limit = Math.max(30, Math.min(50, overlapCharacters));

          if (backtrackLen + unitLen + space <= limit) {
            backtrackLen += unitLen + space;
            backtrackCount++;
          } else {
            break;
          }
        }

        const totalUnitsInChunk = i - startIndex;
        if (backtrackCount >= totalUnitsInChunk && totalUnitsInChunk > 0) {
          backtrackCount = totalUnitsInChunk - 1;
        }

        i = i - backtrackCount;
      }
    }
  }

  // Merge trailing chunks
  if (paragraphChunks.length > 1) {
    const lastIndex = paragraphChunks.length - 1;
    const lastChunk = paragraphChunks[lastIndex];
    const prevChunk = paragraphChunks[lastIndex - 1];

    if (lastChunk.text.length < 100 && prevChunk.topic === lastChunk.topic) {
      const combinedLen = prevChunk.text.length + 1 + lastChunk.text.length;
      if (combinedLen <= 450) {
        prevChunk.text = `${prevChunk.text} ${lastChunk.text}`;
        paragraphChunks.pop();
      }
    }
  }

  return paragraphChunks;
}

/**
 * Splits question list content into independent question blocks.
 */
function splitIntoQuestions(content: string): string[] {
  const lines = content.split("\n");
  const questions: string[] = [];
  let currentQuestion = "";
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    
    if (/^\s*(Q\d+|Question\s*\d+|Q\s*:|\[Q\d+\])/i.test(trimmed) || /^\s*\d+[\.\)]\s+/.test(trimmed)) {
      if (currentQuestion) {
        questions.push(currentQuestion.trim());
      }
      currentQuestion = line;
    } else {
      if (currentQuestion) {
        currentQuestion += "\n" + line;
      } else {
        currentQuestion = line;
      }
    }
  }
  
  if (currentQuestion) {
    questions.push(currentQuestion.trim());
  }
  
  return questions;
}

/**
 * Splits mixed content region dynamically into sub-regions.
 */
function splitMixedRegion(content: string): RegionAnalysis[] {
  const lines = content.split("\n");
  const subRegions: RegionAnalysis[] = [];
  
  let currentType: RegionAnalysis["type"] | null = null;
  let currentContent: string[] = [];
  
  const flushSubRegion = () => {
    if (currentType !== null && currentContent.length > 0) {
      subRegions.push({
        type: currentType,
        content: currentContent.join("\n").trim()
      });
    }
    currentType = null;
    currentContent = [];
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
    
    if (currentType === null) {
      currentType = lineType;
      currentContent.push(trimmed);
    } else if (currentType === lineType) {
      if (lineType === "heading" || lineType === "subheading") {
        flushSubRegion();
        currentType = lineType;
        currentContent.push(trimmed);
      } else {
        currentContent.push(trimmed);
      }
    } else {
      flushSubRegion();
      currentType = lineType;
      currentContent.push(trimmed);
    }
  }
  
  flushSubRegion();
  return subRegions;
}

/**
 * Detects if a document is structured (contains table, question lists, or bullet lists).
 */
function isStructuredDocument(doc: DocumentProcessingResult): boolean {
  if (!doc.documentAnalysis || !doc.documentAnalysis.pages) return false;
  
  for (const page of doc.documentAnalysis.pages) {
    for (const region of page.regions) {
      if (
        region.type === "table" || 
        region.type === "questions" || 
        region.type === "bullet_list" ||
        region.type === "mixed"
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Performs topic-aware adaptive chunking for structured documents.
 */
function chunkStructuredDocument(
  doc: DocumentProcessingResult
): RawChunkInput[] {
  const rawChunks: RawChunkInput[] = [];
  const headingBuffer: string[] = [];
  
  const counts: Record<string, number> = {
    paragraph: 0,
    bullet_list: 0,
    questions: 0,
    table: 0
  };
  
  let currentChunkText = "";
  let currentChunkTopic = "general";
  let currentChunkIsTable = false;
  let pageStart = 1;
  
  const flushChunk = (pageEnd: number) => {
    const trimmed = currentChunkText.trim();
    if (trimmed.length > 0) {
      rawChunks.push({
        text: trimmed,
        pageStart: pageStart,
        pageEnd: pageEnd,
        topic: currentChunkTopic,
        isTableRowChunk: currentChunkIsTable
      });
    }
    currentChunkText = "";
    currentChunkTopic = "general";
    currentChunkIsTable = false;
    pageStart = pageEnd;
  };
  
  let activeTopic = "general";
  
  if (!doc.documentAnalysis || !doc.documentAnalysis.pages) return [];
  
  for (const pageAnalysis of doc.documentAnalysis.pages) {
    const pageNum = pageAnalysis.page;
    
    const processRegionList = (regions: RegionAnalysis[]) => {
      for (const region of regions) {
        if (region.type === "mixed") {
          const subRegions = splitMixedRegion(region.content);
          processRegionList(subRegions);
          continue;
        }
        
        // Detect topic boundary
        const regionTopic = getTopicFromText(region.content);
        if (regionTopic !== null) {
          activeTopic = regionTopic;
        }
        
        const isHeading = region.type === "heading" || region.type === "subheading";
        const hasTopicSignal = hasNewTopicSignal(region.content);
        const topicChanged = regionTopic !== null && currentChunkTopic !== "general" && regionTopic !== currentChunkTopic;
        const reachedSoftLimit = currentChunkText && (currentChunkText.length >= 1200);
        const wouldExceedHardLimit = currentChunkText && (currentChunkText.length + region.content.length > 1600);
        
        // Flush chunk immediately if we hit a logical split boundary or size thresholds
        if (currentChunkText && (isHeading || hasTopicSignal || topicChanged || reachedSoftLimit || wouldExceedHardLimit)) {
          flushChunk(pageNum);
        }
        
        if (isHeading) {
          headingBuffer.push(region.content);
          continue;
        }
        
        if (!currentChunkText) {
          pageStart = pageNum;
          currentChunkTopic = activeTopic;
          if (region.type === "table") {
            currentChunkIsTable = true;
          }
        }
        
        let textToAppend = region.content;
        let incrementCount = 1;
        
        if (region.type === "table" && region.content.includes("|")) {
          const rows: { topic: string; formatted: string }[] = [];
          const lines = region.content.split("\n").map(l => l.trim()).filter(Boolean);
          if (lines.length > 0) {
            let headers = ["Topic", "Questions"];
            let startIdx = 0;
            if (lines.length >= 2) {
              headers = lines[0].split("|").map(s => s.trim()).filter(Boolean);
              startIdx = 1;
            }
            for (let j = startIdx; j < lines.length; j++) {
              const cells = lines[j].split("|").map(s => s.trim());
              if (cells.length === 0 || !cells[0]) continue;
              const { topic, formatted } = formatTableRow(headers, cells);
              rows.push({ topic: topic.toLowerCase().trim(), formatted });
            }
          }
          textToAppend = rows.map(r => r.formatted).join("\n\n");
          incrementCount = rows.length;
        } else if (region.type === "questions") {
          const questionBlocks = splitIntoQuestions(region.content);
          incrementCount = questionBlocks.length;
        }
        
        if (headingBuffer.length > 0) {
          textToAppend = headingBuffer.join("\n") + "\n" + textToAppend;
          headingBuffer.length = 0;
        }
        
        if (region.type in counts) {
          counts[region.type] += incrementCount;
        }
        
        const spacer = currentChunkText ? (region.type === "paragraph" ? " " : "\n\n") : "";
        currentChunkText += spacer + textToAppend;
      }
    };
    
    processRegionList(pageAnalysis.regions);
  }
  
  if (headingBuffer.length > 0) {
    const spaceNeeded = currentChunkText ? "\n\n" : "";
    currentChunkText += spaceNeeded + headingBuffer.join("\n");
  }
  
  const lastPageNum = doc.pages[doc.pages.length - 1]?.pageNumber || 1;
  flushChunk(lastPageNum);
  
  console.log("=== [ADAPTIVE CHUNKER REGION METRICS] ===");
  for (const [type, count] of Object.entries(counts)) {
    console.log(`${type.charAt(0).toUpperCase() + type.slice(1)} -> ${count} chunks`);
  }
  console.log("=========================================");
  
  return rawChunks;
}

/**
 * Checks if a chunk contains only headings, topic titles, or single-word strings.
 */
function isHeadingOrTopicChunk(text: string, topic: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  
  if (detectHeading(trimmed) || detectSubheading(trimmed) || trimmed.startsWith("#")) {
    return true;
  }
  
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("topic:") || lower === topic.toLowerCase()) {
    return true;
  }
  
  if (trimmed.split(/\s+/).length === 1) {
    return true;
  }
  
  return false;
}

/**
 * Main chunk consolidation pass (combines headings, tiny chunks, lists, and tables).
 */
function pass1Consolidate(chunks: RawChunkInput[]): RawChunkInput[] {
  if (chunks.length <= 1) return chunks;
  
  const result: RawChunkInput[] = [];
  let current = { ...chunks[0] };
  
  for (let i = 1; i < chunks.length; i++) {
    const next = chunks[i];
    let canMerge = false;
    
    if (current.topic === next.topic) {
      if (isHeadingOrTopicChunk(current.text, current.topic)) {
        canMerge = true;
      } else if (isHeadingOrTopicChunk(next.text, next.topic)) {
        canMerge = false;
      } else if (current.text.length < 100 || next.text.length < 100) {
        canMerge = true;
      } else if (current.isTableRowChunk && next.isTableRowChunk) {
        canMerge = true;
      } else if (current.text.length + next.text.length < 900) {
        canMerge = true;
      }
    }
    
    if (canMerge) {
      const spaceNeeded = current.isTableRowChunk && next.isTableRowChunk ? 2 : 1;
      const combinedLen = current.text.length + next.text.length + spaceNeeded;
      if (combinedLen <= 1600) {
        current.text += (current.isTableRowChunk && next.isTableRowChunk ? "\n\n" : "\n") + next.text;
        current.pageEnd = Math.max(current.pageEnd, next.pageEnd);
        current.isTableRowChunk = current.isTableRowChunk || next.isTableRowChunk;
      } else {
        result.push(current);
        current = { ...next };
      }
    } else {
      result.push(current);
      current = { ...next };
    }
  }
  
  result.push(current);
  return result;
}

/**
 * Second pass to clean up and merge any remaining orphan/tiny chunks (< 100 characters).
 */
function pass2Consolidate(chunks: RawChunkInput[]): RawChunkInput[] {
  if (chunks.length <= 1) return chunks;
  
  const result: RawChunkInput[] = [];
  let i = 0;
  
  while (i < chunks.length) {
    const current = chunks[i];
    
    if (current.text.length < 100) {
      let merged = false;
      
      if (result.length > 0) {
        const prev = result[result.length - 1];
        if (prev.topic === current.topic && prev.text.length + current.text.length + 2 <= 1600) {
          prev.text += "\n" + current.text;
          prev.pageEnd = Math.max(prev.pageEnd, current.pageEnd);
          merged = true;
        }
      }
      
      if (!merged && i + 1 < chunks.length) {
        const next = chunks[i + 1];
        if (next.topic === current.topic && next.text.length + current.text.length + 2 <= 1600) {
          next.text = current.text + "\n" + next.text;
          next.pageStart = Math.min(current.pageStart, next.pageStart);
          merged = true;
        }
      }
      
      if (!merged) {
        if (result.length > 0) {
          const prev = result[result.length - 1];
          if (prev.text.length + current.text.length + 2 <= 1600) {
            prev.text += "\n" + current.text;
            prev.pageEnd = Math.max(prev.pageEnd, current.pageEnd);
            merged = true;
          }
        }
        if (!merged && i + 1 < chunks.length) {
          const next = chunks[i + 1];
          if (next.text.length + current.text.length + 2 <= 1600) {
            next.text = current.text + "\n" + next.text;
            next.pageStart = Math.min(current.pageStart, next.pageStart);
            merged = true;
          }
        }
      }
      
      if (merged) {
        i++;
        continue;
      }
    }
    
    result.push(current);
    i++;
  }
  
  return result;
}

/**
 * Consumes structural layout region information or falls back to semantic text rules to build chunks.
 */
export function chunkDocument(
  doc: DocumentProcessingResult,
  documentId: string,
  config: ChunkConfig
): ChunkingResult {
  const { overlapCharacters } = config;

  console.log(
    `[ChunkingEngine] Adaptive chunking document ${documentId}`
  );

  const rawChunks: RawChunkInput[] = [];

  if (!isStructuredDocument(doc)) {
    console.log("[ChunkingEngine] Running default sentence-level semantic fallback generator.");
    for (const page of doc.pages) {
      if (!page.extractedText || page.extractedText.trim().length === 0) continue;
      const subChunks = chunkParagraphRegion(page.extractedText, page.pageNumber, overlapCharacters);
      for (const sc of subChunks) {
        rawChunks.push({
          text: sc.text,
          pageStart: page.pageNumber,
          pageEnd: page.pageNumber,
          topic: sc.topic,
          isTableRowChunk: false
        });
      }
    }
  } else {
    console.log("[ChunkingEngine] Running structured region-aware chunking generator.");
    const structuredChunks = chunkStructuredDocument(doc);
    rawChunks.push(...structuredChunks);
  }

  // Perform chunk consolidation (Pass 1 & Pass 2)
  console.log(`[ChunkingEngine] Consolidating chunks (Pass 1 & Pass 2)... Input chunks: ${rawChunks.length}`);
  const consolidatedP1 = pass1Consolidate(rawChunks);
  const consolidated = pass2Consolidate(consolidatedP1);
  console.log(`[ChunkingEngine] Consolidation complete. Final chunks: ${consolidated.length}`);

  // Generate deterministic SHA-256 chunk IDs
  const chunks: Chunk[] = consolidated.map((c, index) => {
    const hash = createHash("sha256")
      .update(`${documentId}_${index}`)
      .digest("hex");

    return {
      chunkId: hash,
      documentId,
      pageStart: c.pageStart,
      pageEnd: c.pageEnd,
      chunkIndex: index,
      text: c.text,
      characterCount: c.text.length,
    };
  });

  const totalChunks = chunks.length;
  let totalChars = 0;
  let largestChunkSize = 0;
  let smallestChunkSize = totalChunks > 0 ? Infinity : 0;

  for (const chunk of chunks) {
    const size = chunk.characterCount;
    totalChars += size;
    if (size > largestChunkSize) largestChunkSize = size;
    if (size < smallestChunkSize) smallestChunkSize = size;
  }

  const averageChunkSize = totalChunks > 0 ? Math.round(totalChars / totalChunks) : 0;

  console.log(
    `[ChunkingEngine] Completed: generated ${totalChunks} chunks (Average Size: ${averageChunkSize} chars)`
  );

  return {
    totalChunks,
    averageChunkSize,
    largestChunkSize,
    smallestChunkSize: smallestChunkSize === Infinity ? 0 : smallestChunkSize,
    chunks,
  };
}
