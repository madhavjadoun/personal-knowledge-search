import { LLMProvider } from "../answerEngine/providers";
import { QuestionDetection } from "./types";

export interface MetadataResult {
  language: string;
  documentType: string;
  questions: QuestionDetection;
}

/**
 * Runs a deterministic, code-based search for questions using regex patterns.
 */
export function detectQuestionsByCode(text: string): QuestionDetection {
  // Pattern 1: Q1, Q2, Question 1, Question 2
  const qPattern = /(?:^|\s|\n)(?:Q|Question)\s*(\d+)[\s.:]/gi;
  let match;
  const numbers: number[] = [];
  while ((match = qPattern.exec(text)) !== null) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && num > 0) {
      numbers.push(num);
    }
  }

  // Pattern 2: Numbered lists ending with a question mark (e.g. "1. What is...? ")
  if (numbers.length === 0) {
    const numQPattern = /(?:^|\n)\s*(\d+)\.\s+[^.\n]*?\?/gi;
    while ((match = numQPattern.exec(text)) !== null) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > 0) {
        numbers.push(num);
      }
    }
  }

  const uniqueNumbers = [...new Set(numbers)].sort((a, b) => a - b);

  if (uniqueNumbers.length >= 2) {
    return {
      isQuestionOriented: true,
      approximateTotalQuestions: uniqueNumbers.length,
      questionNumbers: uniqueNumbers,
      questionPattern: /Q\d+/i.test(text) ? "Q1, Q2..." : "Numbered list",
    };
  }

  // Pattern 3: Interrogative sentences count
  const qMarkMatches = text.match(/\?/g);
  if (qMarkMatches && qMarkMatches.length >= 4) {
    return {
      isQuestionOriented: true,
      approximateTotalQuestions: qMarkMatches.length,
      questionNumbers: [],
      questionPattern: "Interrogative sentences",
    };
  }

  return {
    isQuestionOriented: false,
    approximateTotalQuestions: "Not Applicable",
    questionNumbers: [],
    questionPattern: "Not Applicable",
  };
}

/**
 * Generates document metadata, type classification, and question-oriented statistics.
 */
export async function generateMetadataAndQuestions(
  textSample: string,
  llmProvider: LLMProvider,
  fullText?: string
): Promise<MetadataResult> {
  const prompt = `You are a document classifier. Analyze the text sample and output the classification metadata.

Follow this output format exactly:
LANGUAGE: [Language of the document, e.g. English, Spanish, etc.]
TYPE: [Type of document, e.g. Research Paper, Homework Assignment, Lecture Slides, Code Documentation, Interview Questions, Syllabus, Other]
QUESTIONS_ORIENTED: [YES or NO]
TOTAL_QUESTIONS: [Approximate number of questions if questions-oriented, otherwise Not Applicable]
QUESTION_NUMBERS: [List of question numbers found, e.g. 1, 2, 3... or Q1, Q2... or Not Applicable]
QUESTION_PATTERN: [Pattern used for questions, e.g. Q1/Q2, Question 1/Question 2, Numbered list, or Not Applicable]

Do not write any introductory or concluding remarks. Just the format above.

Document Text Sample:
${textSample}

Metadata:`.trim();

  // Default values
  const result: MetadataResult = {
    language: "English",
    documentType: "Other",
    questions: {
      isQuestionOriented: false,
      approximateTotalQuestions: "Not Applicable",
      questionNumbers: [],
      questionPattern: "Not Applicable",
    },
  };

  try {
    const rawOutput = await llmProvider.generate(prompt);
    const lines = rawOutput.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      const parts = trimmed.split(":");
      if (parts.length < 2) continue;

      const key = parts[0].trim().toUpperCase();
      const val = parts.slice(1).join(":").trim();

      if (key === "LANGUAGE") {
        result.language = val || "English";
      } else if (key === "TYPE") {
        result.documentType = val || "Other";
      } else if (key === "QUESTIONS_ORIENTED") {
        result.questions.isQuestionOriented = val.toUpperCase().startsWith("YES");
      } else if (key === "TOTAL_QUESTIONS") {
        if (result.questions.isQuestionOriented && val.toUpperCase() !== "NOT APPLICABLE") {
          const num = parseInt(val, 10);
          result.questions.approximateTotalQuestions = isNaN(num) ? "Not Applicable" : num;
        } else {
          result.questions.approximateTotalQuestions = "Not Applicable";
        }
      } else if (key === "QUESTION_NUMBERS") {
        if (result.questions.isQuestionOriented && val.toUpperCase() !== "NOT APPLICABLE") {
          const nums = val
            .split(",")
            .map((item) => {
              const matched = item.match(/\d+/);
              return matched ? parseInt(matched[0], 10) : null;
            })
            .filter((n): n is number => n !== null);
          result.questions.questionNumbers = [...new Set(nums)].sort((a, b) => a - b);
        }
      } else if (key === "QUESTION_PATTERN") {
        result.questions.questionPattern =
          result.questions.isQuestionOriented ? val || "Not Applicable" : "Not Applicable";
      }
    }
  } catch (err) {
    console.error("[DocIntel] Failed to generate metadata and questions:", err);
  }

  // Deterministic fallback/override: scan the full text (or sample) for questions by code
  const codeQuestions = detectQuestionsByCode(fullText || textSample);
  if (codeQuestions.isQuestionOriented) {
    result.questions = codeQuestions;
    if (result.documentType === "Other" || result.documentType === "Homework Assignment") {
      result.documentType = "Questions & Answers Document";
    }
  }

  return result;
}
