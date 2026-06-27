import { LLMProvider } from "../answerEngine/providers";

/**
 * Generates a concise, document-level summary (max 300 words).
 * Covers every major section of the document based on a representative text sample.
 */
export async function generateSummary(
  textSample: string,
  llmProvider: LLMProvider
): Promise<string> {
  const prompt = `You are a document intelligence analyzer. Summarize the following document text sample.

Your summary must:
1. Provide a comprehensive, high-level overview of the entire document.
2. Cover every major section, topic, or objective discussed.
3. Be clean, professional, and easy to read.
4. Be strictly limited to a maximum of 300 words.
5. Focus only on the facts present in the text. Do not add outside knowledge.

Document Text Sample:
${textSample}

Summary:`.trim();

  try {
    const summary = await llmProvider.generate(prompt);
    return summary.trim();
  } catch (err) {
    console.error("[DocIntel] Failed to generate summary:", err);
    return "Summary generation failed due to a system error.";
  }
}
