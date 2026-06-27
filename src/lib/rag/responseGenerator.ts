import { AIProvider } from "./aiProvider";
import { Intent } from "./intentClassifier";
import { GeminiResult } from "./adaptiveRetrieval";

/**
 * Invokes the active LLM provider with intent-specific system instructions and strict context enforcement.
 */
export async function generateFinalAnswer(
  question: string,
  contextText: string,
  intent: Intent,
  provider: AIProvider
): Promise<GeminiResult> {
  const userPrompt = `Context:\n${contextText}\n\nQuestion:\n${question}`;

  let systemInstruction = `You are an AI assistant.
Answer ONLY using the provided document context.
If the answer is not present in the context, reply exactly:
"I couldn't find this information in the uploaded document."
Never hallucinate or use external knowledge.`;

  if (intent === "MCQ_GENERATION") {
    systemInstruction = `You are an AI assistant.
Generate multiple choice questions (MCQs) ONLY using the provided document context.
Do not invent any facts outside the context.
For each question, you must return exactly:
Question: [Question text]
Option A: [Option A text]
Option B: [Option B text]
Option C: [Option C text]
Option D: [Option D text]
Correct Answer: [Option A, B, C, or D]
Explanation: [Explanation explaining why using the context]`;
  } else if (intent === "SUMMARY") {
    systemInstruction = `You are an AI assistant.
Generate a structured, detailed summary containing all key facts, definitions, formulas, or topics mentioned ONLY using the provided context.
If the information is not present, reply exactly: "I couldn't find this information in the uploaded document."
Never hallucinate or use external knowledge.`;
  } else if (intent === "LIST") {
    systemInstruction = `You are an AI assistant.
Extract and list EVERY question, problem, or task mentioned in the provided document context.
Do not skip any. Number them sequentially starting from 1.
Include the full question text for each entry.
If a question has sub-parts, list them under the parent question.
Do not summarize or paraphrase — copy the question text exactly as it appears.
If the answer is not present in the context, reply: "I couldn't find this information in the uploaded document."`;
  }

  return provider.generateText(userPrompt, systemInstruction);
}
