import { LLMProvider } from "../answerEngine/providers";

/**
 * Splits a user query into independent, self-contained intent queries.
 * For example: "Summarize this document and explain AdaBoost." ->
 * ["Summarize this document", "Explain AdaBoost"]
 */
export async function splitQuery(
  query: string,
  llmProvider: LLMProvider
): Promise<string[]> {
  const q = query.trim();

  // Rule-based check: if query has no conjunctions and is short, it's a single intent
  if (q.length < 35 && !/\b(and|or|as\s+well\s+as|with|then|also|,|;)\b/i.test(q)) {
    return [q];
  }

  const prompt = `You are a query splitter. Your task is to split a user's input query into a list of independent, standalone intents.

Rules:
1. If the query contains only a single request, return it as a list with one flag.
2. If the query contains multiple requests (e.g. combined with "and", "as well as", punctuation like commas or semicolons), split them into separate standalone sentences.
3. Make each sentence grammatically complete and self-contained (e.g. resolve implicit subjects so "explain K-Means and K-Medoids" -> "explain K-Means", "explain K-Medoids").
4. Output each intent on a new line starting with a bullet point "-".
5. Do not add any introductory or concluding text.

User Input: ${q}
Intents:`.trim();

  try {
    const response = await llmProvider.generate(prompt);
    const lines = response.split("\n");
    const intents: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
        const intentText = trimmed.substring(1).trim();
        if (intentText) {
          intents.push(intentText);
        }
      }
    }

    if (intents.length > 0) {
      return intents;
    }
  } catch (err) {
    console.error("[QueryRouter] Failed to split query using LLM:", err);
  }

  // Fallback to original query
  return [q];
}
