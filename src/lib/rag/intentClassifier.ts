export type Intent =
  | "QUESTION_LOOKUP"
  | "TOPIC_SEARCH"
  | "MCQ_GENERATION"
  | "SUMMARY"
  | "EXPLANATION"
  | "COMPARE"
  | "COUNT"
  | "LIST"
  | "UNKNOWN";

/**
 * Classifies query intent using deterministic heuristics only.
 * No LLM call — guarantees identical classification for the same query every time.
 */
export function classifyIntent(query: string): Intent {
  return classifyIntentHeuristically(query);
}

/**
 * Heuristically classifies query intent based on keywords and regular expressions.
 */
export function classifyIntentHeuristically(query: string): Intent {
  const lower = query.toLowerCase();

  // 1. QUESTION_LOOKUP
  if (
    /\bquestion\s*\d+\b/i.test(lower) ||
    /\bq\s*\d+\b/i.test(lower) ||
    /\bproblem\s*\d+\b/i.test(lower) ||
    /\bno\s*\d+\b/i.test(lower)
  ) {
    return "QUESTION_LOOKUP";
  }

  // 2. MCQ_GENERATION
  if (
    lower.includes("mcq") ||
    lower.includes("multiple choice") ||
    lower.includes("quiz") ||
    lower.includes("practice questions")
  ) {
    return "MCQ_GENERATION";
  }

  // 3. COUNT (check before LIST so "how many" isn't caught by "list")
  if (
    lower.includes("how many") ||
    lower.includes("count") ||
    lower.includes("number of")
  ) {
    return "COUNT";
  }

  // 4. LIST (check before SUMMARY so "list all" gets LIST intent)
  if (
    lower.includes("list all") ||
    lower.includes("list every") ||
    lower.includes("show all") ||
    lower.includes("show every") ||
    lower.includes("get all") ||
    lower.includes("extract all") ||
    lower.includes("extract every")
  ) {
    return "LIST";
  }

  // 5. SUMMARY
  if (
    lower.includes("summarize") ||
    lower.includes("summary") ||
    lower.includes("overview") ||
    lower.includes("outline") ||
    lower.includes("table of contents")
  ) {
    return "SUMMARY";
  }

  // 6. COMPARE
  if (
    lower.includes("compare") ||
    lower.includes("difference") ||
    lower.includes("vs") ||
    lower.includes("contrast")
  ) {
    return "COMPARE";
  }

  // 7. TOPIC_SEARCH
  const dsaKeywords = [
    "array", "arrays", "graph", "graphs", "tree", "trees", "dp", "dynamic programming", "sql", "database",
    "machine learning", "ml", "sorting", "binary search", "hashing", "two pointers", "sliding window",
    "linked list", "stack", "queue", "heap", "recursion"
  ];
  if (dsaKeywords.some((keyword) => lower.includes(keyword))) {
    return "TOPIC_SEARCH";
  }

  // 8. EXPLANATION
  if (
    lower.includes("explain") ||
    lower.includes("what is") ||
    lower.includes("why") ||
    lower.includes("how do") ||
    lower.includes("define")
  ) {
    return "EXPLANATION";
  }

  return "UNKNOWN";
}
