import { StructuredBlock } from "./types";

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

export function parsePageToBlocks(text: string): StructuredBlock[] {
  const lines = text.split("\n");
  const blocks: StructuredBlock[] = [];
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      i++;
      continue;
    }
    
    // 1. Table Row detection
    if (trimmed.includes("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().includes("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }
      
      let headers = ["Topic", "Questions"];
      let startIdx = 0;
      if (tableLines.length >= 2) {
        headers = tableLines[0].split("|").map(s => s.trim()).filter(Boolean);
        startIdx = 1;
      }
      
      for (let j = startIdx; j < tableLines.length; j++) {
        const cells = tableLines[j].split("|").map(s => s.trim());
        if (cells.length === 0 || !cells[0]) continue;
        
        const { topic, formatted } = formatTableRow(headers, cells);
        blocks.push({
          type: "table_row",
          topic: topic.toLowerCase().trim(),
          text: formatted
        });
      }
      continue;
    }
    
    // 2. Heading detection
    if (detectHeading(trimmed)) {
      blocks.push({
        type: "heading",
        text: trimmed
      });
      i++;
      continue;
    }
    
    // 3. Subheading detection
    if (detectSubheading(trimmed)) {
      blocks.push({
        type: "subheading",
        text: trimmed
      });
      i++;
      continue;
    }
    
    // 4. Question detection
    if (detectQuestion(trimmed)) {
      let questionText = trimmed;
      i++;
      while (i < lines.length) {
        const nextLine = lines[i].trim();
        if (nextLine.length === 0) {
          i++;
          continue;
        }
        if (detectHeading(nextLine) || detectSubheading(nextLine) || detectQuestion(nextLine) || nextLine.includes("|") || detectBullet(nextLine) || detectNumberedList(nextLine)) {
          break;
        }
        questionText += "\n" + nextLine;
        i++;
      }
      blocks.push({
        type: "questions",
        text: questionText
      });
      continue;
    }
    
    // 5. Bullet List detection
    if (detectBullet(trimmed) || detectNumberedList(trimmed)) {
      let listText = trimmed;
      i++;
      while (i < lines.length) {
        const nextLine = lines[i].trim();
        if (nextLine.length === 0) {
          i++;
          continue;
        }
        if (detectHeading(nextLine) || detectSubheading(nextLine) || detectQuestion(nextLine) || nextLine.includes("|")) {
          break;
        }
        listText += "\n" + nextLine;
        i++;
      }
      blocks.push({
        type: "bullet_list",
        text: listText
      });
      continue;
    }
    
    // 6. Paragraph detection
    let paraText = trimmed;
    i++;
    while (i < lines.length) {
      const nextLine = lines[i].trim();
      if (nextLine.length === 0) {
        i++;
        continue;
      }
      if (detectHeading(nextLine) || detectSubheading(nextLine) || detectQuestion(nextLine) || nextLine.includes("|") || detectBullet(nextLine) || detectNumberedList(nextLine)) {
        break;
      }
      paraText += "\n" + nextLine;
      i++;
    }
    blocks.push({
      type: "paragraph",
      text: paraText
    });
  }
  
  if (blocks.length === 0 && text.trim().length > 0) {
    blocks.push({
      type: "paragraph",
      text: text.trim()
    });
  }
  
  return blocks;
}
