export interface Chunk {
  pageNumber: number; // 1-based page number
  chunkIndex: number;  // 0-based global sequence index of the chunk
  content: string;     // With metadata frontmatter prepended
}

const CHARS_PER_TOKEN = 4;
const TARGET_MAX_TOKENS = 1000;
const OVERLAP_TOKENS = 150;

const MAX_CHUNK_CHARS = TARGET_MAX_TOKENS * CHARS_PER_TOKEN; // 4000 characters
const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN;       // 600 characters

/**
 * Strips the metadata block from the chunk content.
 */
export function stripMetadata(content: string): string {
  return content.replace(/^---[\s\S]*?---\n*/, "");
}

const QUESTION_BOUNDARY = /(?:^|\n)(?=(?:QUESTION|Question|NUMERICAL|Numerical|PROBLEM|Problem|EXPERIMENT|Experiment|Q|No\.?)\s*\d+\b|\d+\.\s*[A-Za-z]|##+\s)/g;

/**
 * Splits document page texts into semantic question-based chunks of approximately 800-1000 tokens.
 * Extracts page and document level metadata and prepends it to the stored chunk content.
 * 
 * Key improvement: splits on question boundaries even without clean newlines,
 * ensuring each question gets its own chunk.
 */
export function chunkDocument(pageTexts: string[], fileName?: string): Chunk[] {
  const chunks: Chunk[] = [];
  let globalChunkIndex = 0;

  for (let i = 0; i < pageTexts.length; i++) {
    const pageNumber = i + 1;
    const pageText = pageTexts[i]?.trim() ?? "";
    
    if (!pageText) {
      continue;
    }

    // Split page text semantically by Question or Heading boundaries
    const segments = splitByQuestionBoundaries(pageText);

    let currentSentences: string[] = [];
    let currentLength = 0;

    for (const segment of segments) {
      currentSentences = [];
      currentLength = 0;

      const trimmedSegment = segment.trim();
      if (!trimmedSegment) {
        continue;
      }

      const segmentLength = trimmedSegment.length;

      // If the segment fits in one chunk, keep it intact
      if (segmentLength <= MAX_CHUNK_CHARS) {
        const contentWithMetadata = addMetadataHeader(trimmedSegment, pageNumber, fileName);
        chunks.push({
          pageNumber,
          chunkIndex: globalChunkIndex++,
          content: contentWithMetadata,
        });
        continue;
      }

      // Sentence boundary splitting for oversized segments
      const sentences = trimmedSegment.split(/(?<=[.!?])\s+/);

      for (const sentence of sentences) {
        const trimmedSentence = sentence.trim();
        if (!trimmedSentence) {
          continue;
        }

        const sentenceLength = trimmedSentence.length;

        if (currentLength + (currentLength > 0 ? 1 : 0) + sentenceLength > MAX_CHUNK_CHARS) {
          if (currentSentences.length > 0) {
            const rawContent = currentSentences.join(" ");
            const contentWithMetadata = addMetadataHeader(rawContent, pageNumber, fileName);
            chunks.push({
              pageNumber,
              chunkIndex: globalChunkIndex++,
              content: contentWithMetadata,
            });

            // Sliding window overlap
            const overlapSentences: string[] = [];
            let overlapLength = 0;
            for (let j = currentSentences.length - 1; j >= 0; j--) {
              const s = currentSentences[j];
              const candidateLength = overlapLength + (overlapLength > 0 ? 1 : 0) + s.length;
              if (candidateLength <= OVERLAP_CHARS) {
                overlapSentences.unshift(s);
                overlapLength = candidateLength;
              } else {
                break;
              }
            }
            currentSentences = overlapSentences;
            currentLength = overlapLength;
          }
        }

        if (sentenceLength > MAX_CHUNK_CHARS) {
          if (currentSentences.length > 0) {
            const rawContent = currentSentences.join(" ");
            const contentWithMetadata = addMetadataHeader(rawContent, pageNumber, fileName);
            chunks.push({
              pageNumber,
              chunkIndex: globalChunkIndex++,
              content: contentWithMetadata,
            });
            currentSentences = [];
            currentLength = 0;
          }

          // Giant sentence fallback: split by words
          const words = trimmedSentence.split(/\s+/);
          let wordChunk: string[] = [];
          let wordChunkLength = 0;

          for (const word of words) {
            const wordLength = word.length;
            if (wordChunkLength + (wordChunkLength > 0 ? 1 : 0) + wordLength > MAX_CHUNK_CHARS) {
              if (wordChunk.length > 0) {
                const rawContent = wordChunk.join(" ");
                const contentWithMetadata = addMetadataHeader(rawContent, pageNumber, fileName);
                chunks.push({
                  pageNumber,
                  chunkIndex: globalChunkIndex++,
                  content: contentWithMetadata,
                });

                const overlapWords: string[] = [];
                let overlapWordLength = 0;
                for (let k = wordChunk.length - 1; k >= 0; k--) {
                  const w = wordChunk[k];
                  const candLength = overlapWordLength + (overlapWordLength > 0 ? 1 : 0) + w.length;
                  if (candLength <= OVERLAP_CHARS) {
                    overlapWords.unshift(w);
                    overlapWordLength = candLength;
                  } else {
                    break;
                  }
                }
                wordChunk = overlapWords;
                wordChunkLength = overlapWordLength;
              }
            }
            wordChunk.push(word);
            wordChunkLength += (wordChunkLength > 0 ? 1 : 0) + wordLength;
          }

          if (wordChunk.length > 0) {
            currentSentences = [wordChunk.join(" ")];
            currentLength = wordChunkLength;
          }
        } else {
          currentSentences.push(trimmedSentence);
          currentLength += (currentLength > 0 ? 1 : 0) + sentenceLength;
        }
      }

      if (currentSentences.length > 0) {
        const rawContent = currentSentences.join(" ");
        const contentWithMetadata = addMetadataHeader(rawContent, pageNumber, fileName);
        chunks.push({
          pageNumber,
          chunkIndex: globalChunkIndex++,
          content: contentWithMetadata,
        });
      }
    }
  }

  return chunks;
}

function splitByQuestionBoundaries(text: string): string[] {
  // Primary split: use boundary regex
  const segments = text.split(QUESTION_BOUNDARY).filter(s => s.trim().length > 0);
  if (segments.length > 1) return segments;

  // Fallback 1: numbered heading style "1.Topic:" or "1. Topic"
  const numberedHeading = /(?=\b\d+\.\s*[A-Z][A-Za-z])/g;
  const fallback1 = text.split(numberedHeading).filter(s => s.trim().length > 0);
  if (fallback1.length > 1) return fallback1;

  // Fallback 2: ALLCAPS keyword + number mid-text (e.g. NUMERICAL 1, QUESTION 3)
  const allcapsPattern = /(?=(?:QUESTION|NUMERICAL|PROBLEM|EXPERIMENT)\s*\d+)/g;
  const fallback2 = text.split(allcapsPattern).filter(s => s.trim().length > 0);
  if (fallback2.length > 1) return fallback2;

  return [text];
}

/**
 * Parses semantic metadata from chunk text and structures it as standard frontmatter.
 */
function addMetadataHeader(content: string, pageNumber: number, fileName?: string): string {
  // Step 1: try named patterns first (Question N, Q N, Problem N, No. N)
  let qNumMatch = content.match(/\b(?:Question|q|problem|No\.?)\s*(\d+)\b/i);

  // Step 2: if not found, try standalone numbered list pattern at start of content
  if (!qNumMatch) {
    const trimmed = content.trimStart();
    const standaloneMatch = trimmed.match(/^(\d+)\.\s+[A-Za-z]/);
    if (standaloneMatch) {
      qNumMatch = standaloneMatch; // standaloneMatch[1] is the number
    }
  }

  const questionNumber = qNumMatch ? qNumMatch[1] : "";

  // 2. Extract Headings / Title (first line of the chunk content)
  const firstLine = content.split("\n")[0]?.trim() || "";
  const headings = firstLine.length > 80 ? firstLine.substring(0, 80) + "..." : firstLine;

  // 3. Extract Topic / DSA category keywords (only from explicitly written topics)
  const topics: string[] = [];
  const lower = content.toLowerCase();
  const lowerHead = content.substring(0, 200).toLowerCase();
  
  if (lowerHead.includes("array") || lowerHead.includes("arrays") || lowerHead.includes("subarray")) {
    topics.push("Array");
  }
  if (lowerHead.includes("linked list") || lowerHead.includes("linked-list") || lowerHead.includes("singly linked")) {
    topics.push("Linked List");
  }
  if (lowerHead.includes("graph") || lowerHead.includes("bfs") || lowerHead.includes("dfs") || lowerHead.includes("shortest path")) {
    topics.push("Graph");
  }
  if (lowerHead.includes("tree") || lowerHead.includes("binary tree") || lowerHead.includes("bst")) {
    topics.push("Tree");
  }
  if (lowerHead.includes("dp") || lowerHead.includes("dynamic programming")) {
    topics.push("Dynamic Programming");
  }
  if (lowerHead.includes("sql") || lowerHead.includes("database")) {
    topics.push("Database/SQL");
  }
  if (lowerHead.includes("kmeans") || lowerHead.includes("k-means")) {
    topics.push("K-Means Clustering");
  }
  if (lowerHead.includes("naive bayes") || lowerHead.includes("naivebayes") || lowerHead.includes("bayes")) {
    topics.push("Naive Bayes");
  }
  if (lowerHead.includes("pca") || lowerHead.includes("principal component")) {
    topics.push("PCA");
  }
  if (lowerHead.includes("sliding window") || lowerHead.includes("slidingwindow")) {
    topics.push("Sliding Window");
  }
  if (lowerHead.includes("two pointer") || lowerHead.includes("two-pointer") || lowerHead.includes("two pointers")) {
    topics.push("Two Pointers");
  }
  if (lowerHead.includes("sorting")) {
    topics.push("Sorting");
  }

  const topic = topics.length > 0 ? topics.join(", ") : "General";

  return `---
document_name: ${fileName || "Unknown"}
page_number: ${pageNumber}
question_number: ${questionNumber}
headings: ${headings}
topic: ${topic}
---
${content}`;
}
