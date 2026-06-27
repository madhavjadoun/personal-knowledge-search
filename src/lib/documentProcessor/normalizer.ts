/**
 * Normalizes page text by stripping excessive whitespace, replacing
 * repeated spaces, normalizing line endings, and cleaning up empty lines
 * while preserving paragraph breaks.
 */
export function normalizeText(text: string): string {
  if (!text) return "";

  // 1. Normalize all line endings to Unix style (\n)
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 2. Process each line individually to clean spaces within the line
  const lines = normalized.split("\n").map(line => {
    // Replace repeated spaces/tabs with a single space
    return line.replace(/[ \t]+/g, " ").trim();
  });

  // 3. Filter lines to remove empty ones, allowing at most a single empty line
  // between non-empty text blocks to preserve structural paragraphs.
  const cleanedLines: string[] = [];
  let wasLastLineEmpty = false;

  for (const line of lines) {
    if (line === "") {
      if (!wasLastLineEmpty) {
        cleanedLines.push("");
        wasLastLineEmpty = true;
      }
    } else {
      cleanedLines.push(line);
      wasLastLineEmpty = false;
    }
  }

  // 4. Join normalized lines and trim page-wide leading/trailing whitespace
  return cleanedLines.join("\n").trim();
}
