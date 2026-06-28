import { createLLMProvider } from "./providers";

export interface MCQQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

function extractJSON(raw: string): string {
  let cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");

  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON array found in LLM response.");
  }

  return cleaned.slice(start, end + 1);
}

export async function generateQuiz(
  chunks: { content: string; page_number: number }[]
): Promise<MCQQuestion[]> {
  if (chunks.length === 0) {
    throw new Error("No text chunks available to generate the quiz.");
  }

  const contentRichChunks = chunks.filter(
    (c) => c.content && c.content.trim().length > 100
  );
  if (contentRichChunks.length === 0) {
    throw new Error("Could not find any content-rich chunks in this document.");
  }

  // Shuffle and pick only 3 chunks — stays within Groq 6000 TPM limit
  const shuffled = [...contentRichChunks].sort(() => Math.random() - 0.5);
  const selectedChunks = shuffled.slice(0, 3);

  const seed = Date.now();

  // Trim each chunk to max 400 characters to control token count
  const context = selectedChunks
    .map((c) => `[Page ${c.page_number}]:\n${c.content.trim().slice(0, 400)}`)
    .join("\n\n---\n\n");

  const llmProvider = createLLMProvider();

  const prompt = `You are a quiz generator. Session: ${seed}.

Generate exactly 10 MCQ questions from the text below.

Output ONLY a valid JSON array. No extra text.
Each object must have: "question", "options" (array of 4), "correct" (exact text of correct option), "explanation" (2-3 sentences why correct is right and others are wrong).

TEXT:
${context}

JSON array:`;

  console.log(
    `[QuizGenerator] Sending prompt to LLM with ${selectedChunks.length} chunks...`
  );

  const response = await llmProvider.generate(prompt);

  console.log(`[QuizGenerator] Raw LLM response length: ${response.length}`);

  try {
    const jsonString = extractJSON(response);
    const parsed = JSON.parse(jsonString);

    if (!Array.isArray(parsed)) {
      throw new Error("LLM response is not a JSON array.");
    }

    const validated: MCQQuestion[] = [];

    for (const q of parsed) {
      const correctVal = q.correct || q.correctAnswer;

      if (
        typeof q.question !== "string" ||
        !Array.isArray(q.options) ||
        q.options.length !== 4 ||
        typeof correctVal !== "string" ||
        typeof q.explanation !== "string"
      ) {
        console.warn("[QuizGenerator] Skipping invalid question:", q);
        continue;
      }

      const correctInOptions = q.options.some(
        (opt: string) =>
          opt.trim().toLowerCase() === correctVal.trim().toLowerCase()
      );

      if (!correctInOptions) {
        const closest = q.options.find((opt: string) =>
          opt.toLowerCase().includes(correctVal.toLowerCase().slice(0, 10))
        );
        validated.push({
          question: q.question.trim(),
          options: q.options.map((o: string) => o.trim()),
          correctAnswer: closest || q.options[0],
          explanation: q.explanation.trim(),
        });
        continue;
      }

      validated.push({
        question: q.question.trim(),
        options: q.options.map((o: string) => o.trim()),
        correctAnswer: correctVal.trim(),
        explanation: q.explanation.trim(),
      });
    }

    if (validated.length === 0) {
      throw new Error("No valid questions found in LLM response.");
    }

    if (validated.length < 10) {
      console.warn(
        `[QuizGenerator] Only ${validated.length} valid questions generated instead of 10.`
      );
    }

    console.log(
      `[QuizGenerator] Successfully validated ${validated.length} questions.`
    );
    return validated;
  } catch (err) {
    console.error(
      "[QuizGenerator] Parse/validation error. Raw response:\n",
      response.slice(0, 500),
      "\nError:",
      err
    );
    throw new Error(
      "Failed to generate a valid MCQ quiz JSON from the document. Please try again."
    );
  }
}