import { LLMProvider } from "../answerEngine/providers";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MemoryTurn {
  userQuestion: string;
  finalAnswer: string;
  documentId?: string;
  pageNumbers: number[];
  timestamp: string;
}

// ── Memory Store ──────────────────────────────────────────────────────────────

// Server-side in-memory store for conversation memory (keyed by sessionId)
const memoryStore = new Map<string, MemoryTurn[]>();

/**
 * Retrieves the conversation history for a given session.
 */
export function getHistory(sessionId: string): MemoryTurn[] {
  return memoryStore.get(sessionId) || [];
}

/**
 * Appends a turn to the conversation history for a given session.
 * Keeps only the last 5 turns.
 */
export function saveTurn(sessionId: string, turn: MemoryTurn): void {
  const history = getHistory(sessionId);
  history.push(turn);
  if (history.length > 5) {
    history.shift(); // Keep only last 5 turns
  }
  memoryStore.set(sessionId, history);
}

/**
 * Clears the conversation memory for a given session.
 */
export function clearMemory(sessionId: string): void {
  memoryStore.delete(sessionId);
}

// ── Follow-up Detection ───────────────────────────────────────────────────────

/**
 * Lightweight rule-based check to identify if a query is a follow-up.
 */
export function detectQueryType(query: string): "NEW_QUERY" | "FOLLOW_UP" {
  const q = query.trim().toLowerCase();

  // 1. Standalone / short follow-up phrases
  const standalonePatterns = [
    /^why\??$/i,
    /^how\??$/i,
    /^explain(\s+more)?\??$/i,
    /^simplify\??$/i,
    /^continue\??$/i,
    /^give(\s+an?)?\s+examples?\??$/i,
    /^summarize(\s+that)?\??$/i,
    /^expand\??$/i,
    /^which(\s+one)?\??$/i,
    /^go\s+on\??$/i,
    /^tell\s+me\s+more\??$/i,
  ];

  for (const pattern of standalonePatterns) {
    if (pattern.test(q)) {
      return "FOLLOW_UP";
    }
  }

  // 2. Inline check for pronouns or follow-up indicators
  const inlinePatterns = [
    /\b(it|this|that|those|these|which\s+one)\b/i,
    /\b(explain\s+more|simplify|continue|give\s+example|summarize\s+that|expand)\b/i,
    /\b(its|their|the\s+former|the\s+latter)\b/i,
    /\b(what\s+about\s+the\s+other|any\s+others)\b/i,
    /^(how\s+about|what\s+about|what\s+are\s+its)\b/i,
  ];

  for (const pattern of inlinePatterns) {
    if (pattern.test(q)) {
      return "FOLLOW_UP";
    }
  }

  return "NEW_QUERY";
}

// ── Query Resolution ──────────────────────────────────────────────────────────

/**
 * Resolves query references using the conversation history.
 * Rewrites the question to be standalone.
 */
export async function resolveQueryReferences(
  query: string,
  history: MemoryTurn[],
  llmProvider: LLMProvider
): Promise<string> {
  if (history.length === 0) return query;

  // Format the last 5 turns of conversation history for the prompt
  const historyText = history
    .map((turn, idx) => `Turn ${idx + 1}:\nUser: ${turn.userQuestion}\nAssistant: ${turn.finalAnswer}`)
    .join("\n\n");

  const prompt = `You are a conversational assistant. Your task is to resolve references, pronouns (like "it", "this", "that", "those", "these", "its", "their"), and ellipsis in a follow-up question based on the conversation history.

Rewrite the follow-up question to be a standalone, fully-articulated question. The standalone question must:
1. Preserve the user's core intent.
2. Be self-contained so that a document search engine can understand it without any conversation history.
3. NEVER answer the question. Only output the rewritten question itself.
4. Do not prefix with labels like "Standalone Question:" or similar. Just output the rewritten text.
5. If the follow-up question is already standalone or doesn't refer to the history, output it exactly as is.

Conversation History (oldest to newest):
${historyText}

Follow-up Question: ${query}
Standalone Question:`.trim();

  try {
    const rewritten = await llmProvider.generate(prompt);
    // Strip surrounding quotes or prefix labels if LLM generates them
    let cleaned = rewritten.trim();
    cleaned = cleaned.replace(/^['"]|['"]$/g, ""); // strip quotes
    cleaned = cleaned.replace(/^standalone question:\s*/i, ""); // strip label
    return cleaned || query;
  } catch (err) {
    console.error("[Memory] Failed to rewrite query, using original query:", err);
    return query;
  }
}

// ── Unrelated Topic Check ──────────────────────────────────────────────────────

/**
 * Checks if a NEW_QUERY starts a completely unrelated topic compared to the history.
 */
export async function isUnrelatedTopic(
  query: string,
  history: MemoryTurn[],
  llmProvider: LLMProvider
): Promise<boolean> {
  if (history.length === 0) return false;

  // Compile list of recent questions as topics context
  const previousTopics = history.map((turn) => `- ${turn.userQuestion}`).join("\n");

  const prompt = `You are a conversation analyzer. Given a new user question and the topics of the previous conversation, determine if the new question starts a completely unrelated topic.
Reply with "YES" if the new question is on a completely unrelated topic.
Reply with "NO" if it is on the same topic, a related subtopic, or a follow-up.

Previous Topic Context:
${previousTopics}

New Question:
${query}

Unrelated? (YES or NO):`.trim();

  try {
    const response = await llmProvider.generate(prompt);
    const ans = response.trim().toUpperCase();
    return ans.startsWith("YES");
  } catch (err) {
    console.error("[Memory] Unrelated topic check failed, assuming related:", err);
    return false;
  }
}
