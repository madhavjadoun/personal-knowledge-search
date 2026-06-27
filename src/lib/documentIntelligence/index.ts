import { DocumentIntelligence } from "./types";
import { generateDocumentIntelligence } from "./documentAnalyzer";
import { chunkDocument } from "../chunkingEngine";

export * from "./types";
export * from "./summaryGenerator";
export * from "./topicExtractor";
export * from "./metadataGenerator";
export * from "./documentAnalyzer";

// ── Query Routing Heuristic ──────────────────────────────────────────────────

/**
 * Detects if a query is a document-level metadata query.
 */
export function detectDocumentQuery(query: string): boolean {
  const q = query.trim().toLowerCase();

  const docLevelPatterns = [
    /\b(summarize\s+(this|the)\s+document|summarize\s+(this|the)\s+pdf)\b/i,
    /^(summarize\s+document|summarize\s+pdf|summarize)\??$/i,
    /\b(give\s+(me\s+)?an?\s+overview)\b/i,
    /\b(what\s+topics\s+(are\s+)?covered|covered\s+topics|topics\s+covered|what\s+is\s+this\s+document\s+about)\b/i,
    /\b(list\s+(major\s+)?concepts|major\s+concepts|key\s+concepts)\b/i,
    /\b(how\s+many\s+questions|question\s+count|approximate\s+questions)\b/i,
    /\b(what\s+type\s+of\s+document|document\s+type|what\s+kind\s+of\s+document|is\s+this\s+a\s+viva|is\s+this\s+a\s+research)\b/i,
    /\b(how\s+many\s+pages|page\s+count|number\s+of\s+pages)\b/i,
    /\b(what\s+is\s+the\s+reading\s+time|estimated\s+reading\s+time|reading\s+time|how\s+long\s+to\s+read)\b/i,
    /^what\s+language\s+is\s+this\s+(document|pdf)\s+written\s+in\??$/i,
    /^how\s+many\s+pages\??$/i,
  ];

  return docLevelPatterns.some((pattern) => pattern.test(q));
}

/**
 * Formats structured intelligence data into a clean, markdown-rendered response.
 */
export function formatIntelligenceResponse(query: string, intel: DocumentIntelligence): string {
  const q = query.trim().toLowerCase();

  // 1. Summary & Overview
  if (/\b(summarize|overview|about)\b/i.test(q)) {
    return `### Document Summary: ${intel.title}\n\n${intel.summary}`;
  }

  // 2. Topics
  if (/\b(topics)\b/i.test(q)) {
    const list = intel.topics.map((t) => `- ${t}`).join("\n");
    return `### Topics Covered in ${intel.title}:\n\n${list}`;
  }

  // 3. Concepts
  if (/\b(concepts)\b/i.test(q)) {
    const categories: Record<string, string[]> = {};
    for (const c of intel.concepts) {
      if (!categories[c.category]) {
        categories[c.category] = [];
      }
      categories[c.category].push(`**${c.name}**: ${c.description}`);
    }

    let out = `### Key Concepts in ${intel.title}:\n\n`;
    for (const [cat, list] of Object.entries(categories)) {
      out += `#### ${cat}s:\n`;
      out += list.map((item) => `- ${item}`).join("\n") + "\n\n";
    }
    return out.trim();
  }

  // 4. Questions
  if (/\b(questions)\b/i.test(q)) {
    const qInfo = intel.questions;
    if (!qInfo.isQuestionOriented) {
      return `### Question Detection: ${intel.title}\n\nThis document does not appear to be question-oriented (Not Applicable).`;
    }
    let out = `### Question Analysis: ${intel.title}\n\n`;
    out += `- **Approximate Total Questions**: ${qInfo.approximateTotalQuestions}\n`;
    out += `- **Question Pattern**: ${qInfo.questionPattern}\n`;
    if (qInfo.questionNumbers && qInfo.questionNumbers.length > 0) {
      out += `- **Question Numbers Detected**: ${qInfo.questionNumbers.join(", ")}\n`;
    }
    return out;
  }

  // 5. Classification, Type, & Language
  if (/\b(type|kind|language)\b/i.test(q)) {
    return `### Document Classification: ${intel.title}\n\n- **Document Type**: ${intel.metadata.documentType}\n- **Language**: ${intel.metadata.language}`;
  }

  // 6. Pages, Reading time, and Chunks Stats
  if (/\b(pages|reading|time|how\s+long)\b/i.test(q)) {
    return `### Document Statistics: ${intel.title}\n\n- **Total Pages**: ${intel.stats.totalPages}\n- **Estimated Reading Time**: ${intel.stats.estimatedReadingTimeMin} minute${intel.stats.estimatedReadingTimeMin !== 1 ? "s" : ""}\n- **Total Chunks**: ${intel.stats.totalChunks}\n- **Average Chunk Size**: ${intel.stats.averageChunkSize} characters\n- **Total Characters**: ${intel.stats.characterCount}`;
  }

  // Fallback: general info sheet
  return `### Document Overview: ${intel.title}\n\n- **Document Type**: ${intel.metadata.documentType}\n- **Language**: ${intel.metadata.language}\n- **Total Pages**: ${intel.stats.totalPages}\n- **Estimated Reading Time**: ${intel.stats.estimatedReadingTimeMin} min\n\n**Summary**:\n${intel.summary}`;
}

// ── Fallback Analysis for Legacy Documents ─────────────────────────────────────

/**
 * Dynamically generates document intelligence for legacy documents
 * where intelligence was not created on upload.
 */
export async function generateLegacyIntelligence(
  supabaseClient: any,
  documentId: string
): Promise<DocumentIntelligence> {
  console.log(`[DocIntel] Running legacy analysis for document ID: ${documentId}`);

  // 1. Fetch document record
  const { data: doc, error: docError } = await supabaseClient
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .single();

  if (docError || !doc) {
    throw new Error(`Legacy Document fetch failed: ${docError?.message || "Document not found"}`);
  }

  // 2. Fetch all chunks
  const { data: dbChunks, error: chunksError } = await supabaseClient
    .from("chunks")
    .select("page_number, content")
    .eq("document_id", documentId)
    .order("chunk_index", { ascending: true });

  if (chunksError || !dbChunks || dbChunks.length === 0) {
    throw new Error(`Legacy Document chunks fetch failed: ${chunksError?.message || "No chunks found"}`);
  }

  // Reconstruct ParsedDoc and Chunks
  const pagesMap = new Map<number, string>();
  for (const c of dbChunks) {
    const pNum = c.page_number;
    pagesMap.set(pNum, (pagesMap.get(pNum) || "") + "\n" + c.content);
  }

  const pagesArray = [...pagesMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([pNum, text]) => ({
      pageNumber: pNum,
      characterCount: text.length,
      extractedText: text.trim(),
    }));

  const parsedDoc = {
    totalPages: pagesArray.length,
    totalCharacters: pagesArray.reduce((acc: number, p: any) => acc + p.characterCount, 0),
    pages: pagesArray,
  };

  const localChunks = dbChunks.map((c: any) => ({
    pageStart: c.page_number,
    pageEnd: c.page_number,
    text: c.content,
  }));

  const intel = await generateDocumentIntelligence(documentId, doc.title, parsedDoc, localChunks);

  // Cache/Upload to storage
  await supabaseClient.storage
    .from("documents")
    .upload(`intelligence/${documentId}.json`, JSON.stringify(intel), {
      contentType: "application/json",
      upsert: true,
    });

  return intel;
}
