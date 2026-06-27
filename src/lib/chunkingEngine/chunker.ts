import { createHash } from "crypto";
import { DocumentProcessingResult } from "../documentProcessor/types";
import { Chunk, ChunkConfig, ChunkingResult } from "./types";

interface TextUnit {
  text: string;
  pageNumber: number;
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
 * Consumes the page-by-page output of the Document Processor and splits it
 * into structured text chunks based on sentence/paragraph boundaries and character constraints.
 */
export function chunkDocument(
  doc: DocumentProcessingResult,
  documentId: string,
  config: ChunkConfig
): ChunkingResult {
  const { maxChunkCharacters, overlapCharacters } = config;

  console.log(
    `[ChunkingEngine] Chunking document ${documentId} (max: ${maxChunkCharacters}, overlap: ${overlapCharacters})`
  );

  // 1. Gather all sentence-level units from all pages
  const units: TextUnit[] = [];

  for (const page of doc.pages) {
    if (!page.extractedText || page.extractedText.trim().length === 0) {
      continue; // Skip empty pages
    }

    // Split page into paragraphs
    const paragraphs = page.extractedText.split("\n\n");
    for (const paragraph of paragraphs) {
      const trimmedPara = paragraph.trim();
      if (trimmedPara.length === 0) continue;

      const sentences = splitIntoSentences(trimmedPara);
      for (const sentence of sentences) {
        units.push({
          text: sentence,
          pageNumber: page.pageNumber,
        });
      }
    }
  }

  // Handle empty document case
  if (units.length === 0) {
    return {
      totalChunks: 0,
      averageChunkSize: 0,
      largestChunkSize: 0,
      smallestChunkSize: 0,
      chunks: [],
    };
  }

  const rawChunks: { text: string; pageStart: number; pageEnd: number }[] = [];

  let i = 0;
  while (i < units.length) {
    const currentUnits: TextUnit[] = [];
    let currentLen = 0;
    const startIndex = i;

    while (i < units.length) {
      const unit = units[i];
      const spaceNeeded = currentUnits.length > 0 ? 1 : 0;

      // Handle single sentences that exceed the max size constraint
      if (unit.text.length > maxChunkCharacters) {
        if (currentUnits.length > 0) {
          // Finalize current chunk first; process this oversized unit in the next loop
          break;
        }

        // Split the oversized sentence at word/space bounds as a last resort
        let remainingText = unit.text;
        while (remainingText.length > 0) {
          let splitLen = Math.min(maxChunkCharacters, remainingText.length);
          if (splitLen < remainingText.length) {
            const lastSpace = remainingText.lastIndexOf(" ", splitLen);
            // Splitting at the last space if it's reasonably far in the chunk
            if (lastSpace > Math.floor(maxChunkCharacters * 0.6)) {
              splitLen = lastSpace;
            }
          }
          const slicedText = remainingText.substring(0, splitLen).trim();
          rawChunks.push({
            text: slicedText,
            pageStart: unit.pageNumber,
            pageEnd: unit.pageNumber,
          });
          remainingText = remainingText.substring(splitLen).trim();
        }
        i++;
        continue;
      }

      if (currentLen + unit.text.length + spaceNeeded <= maxChunkCharacters) {
        currentUnits.push(unit);
        currentLen += unit.text.length + spaceNeeded;
        i++;
      } else {
        break; // Chunk is full
      }
    }

    if (currentUnits.length > 0) {
      const chunkText = currentUnits.map((u) => u.text).join(" ");
      rawChunks.push({
        text: chunkText,
        pageStart: currentUnits[0].pageNumber,
        pageEnd: currentUnits[currentUnits.length - 1].pageNumber,
      });

      // Implement sentence-level backtracking for overlap
      if (i < units.length) {
        let backtrackLen = 0;
        let backtrackCount = 0;

        for (let j = i - 1; j >= startIndex; j--) {
          const unitLen = units[j].text.length;
          const space = backtrackCount > 0 ? 1 : 0;
          if (backtrackLen + unitLen + space <= overlapCharacters) {
            backtrackLen += unitLen + space;
            backtrackCount++;
          } else {
            break;
          }
        }

        // Safeguard: make sure we don't backtrack by the entire chunk (avoid infinite loops)
        const totalUnitsInChunk = i - startIndex;
        if (backtrackCount >= totalUnitsInChunk && totalUnitsInChunk > 0) {
          backtrackCount = totalUnitsInChunk - 1;
        }

        i = i - backtrackCount;
      }
    }
  }

  // 2. Merge very small trailing chunks if they fit inside maxChunkCharacters
  if (rawChunks.length > 1) {
    const lastIndex = rawChunks.length - 1;
    const lastChunk = rawChunks[lastIndex];
    const prevChunk = rawChunks[lastIndex - 1];

    const smallThreshold = Math.max(100, Math.floor(maxChunkCharacters * 0.2));
    if (lastChunk.text.length < smallThreshold) {
      const combinedLen = prevChunk.text.length + 1 + lastChunk.text.length;
      if (combinedLen <= maxChunkCharacters) {
        console.log(
          `[ChunkingEngine] Merging small trailing chunk of size ${lastChunk.text.length} into previous chunk.`
        );
        prevChunk.text = `${prevChunk.text} ${lastChunk.text}`;
        prevChunk.pageEnd = Math.max(prevChunk.pageEnd, lastChunk.pageEnd);
        rawChunks.pop();
      }
    }
  }

  // 3. Generate deterministic SHA-256 chunk IDs
  const chunks: Chunk[] = rawChunks.map((c, index) => {
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

  // Calculate final statistics
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
