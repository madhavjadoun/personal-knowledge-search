/**
 * Normalizes query string patterns to improve search consistency.
 * Standardizes question names, specific concepts, lowercases, removes punctuation, and cleans spacing.
 */
export function normalizeQuery(query: string): string {
  if (!query) return "";

  let normalized = query.trim().toLowerCase();

  // 1. Normalize Question/Problem/Number tags (e.g. q9, Question9, problem 9, no.9, question number 9 -> question 9)
  normalized = normalized.replace(/\b(?:question|problem)\s*(?:no\.?|number)?\s*(\d+)\b/gi, "question $1");
  normalized = normalized.replace(/\bq\s*(\d+)\b/gi, "question $1");
  normalized = normalized.replace(/\bno\.?\s*(\d+)\b/gi, "question $1");

  // 2. Normalize typical DSA/ML terminology structures
  normalized = normalized.replace(/\blinked\s*list\b/gi, "linked list");
  normalized = normalized.replace(/\blinkedlist\b/gi, "linked list");
  normalized = normalized.replace(/\bsliding\s*window\b/gi, "sliding window");
  normalized = normalized.replace(/\bslidingwindow\b/gi, "sliding window");
  
  normalized = normalized.replace(/\bk\s*means\b/gi, "k-means");
  normalized = normalized.replace(/\bkmeans\b/gi, "k-means");
  
  normalized = normalized.replace(/\bnaive\s*bayes\b/gi, "naive bayes");
  normalized = normalized.replace(/\bnaivebayes\b/gi, "naive bayes");

  normalized = normalized.replace(/\btwo\s*pointer\b/gi, "two pointer");
  
  // 3. Remove punctuation (retaining hyphens, spaces, alphanumeric)
  normalized = normalized.replace(/[^\w\s-]/gi, "");

  // Normalize bare number queries like "7" or "Q 7" to "question 7"
  // Only apply if the entire query (after cleanup) is just a number
  if (/^\d+$/.test(normalized.trim())) {
    normalized = `question ${normalized.trim()}`;
  }

  // 4. Fix spaces (collapse multiple spaces to single)
  normalized = normalized.replace(/\s+/g, " ").trim();

  return normalized;
}

/**
 * Extracts question number from a query if it looks like a question lookup.
 * Returns the question number string (e.g. "6") or null if not a question lookup.
 * 
 * Handles: q6, Q6, question 6, Question 6, question number 6, problem 6, no.6
 * After normalization, all of these become "question 6" so we just check for that pattern.
 */
export function extractQuestionNumber(normalizedQuery: string): string | null {
  const match = normalizedQuery.match(/\bquestion\s+(\d+)\b/i);
  return match ? match[1] : null;
}
