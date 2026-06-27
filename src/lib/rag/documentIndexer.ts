import { AIProvider } from "./aiProvider";

export interface QuestionIndexEntry {
  number: string;
  title: string;
  style: string;
  approximate_page: number;
  document_id: string;
  file_name: string;
}

export async function buildQuestionIndex(
  pageTexts: string[],
  provider: AIProvider,
  documentId: string,
  fileName: string
): Promise<QuestionIndexEntry[]> {
  try {
    const fullText = pageTexts.join("\n\n");
    const sample = fullText.substring(0, 8000);

    const prompt = `You are analyzing a document to identify all distinct questions, problems, sections, or experiments.

Document sample:
${sample}

Task: Identify ALL items that represent a question, problem, numerical, experiment, section, or exercise that a student would need to answer or study.

Return ONLY a valid JSON array. No explanation, no markdown, no code blocks. Just the raw JSON array.

Format:
[
  {
    "number": "1",
    "title": "Linear Regression",
    "style": "N.Title",
    "approximate_page": 1
  },
  {
    "number": "2", 
    "title": "Polynomial Regression",
    "style": "N.Title",
    "approximate_page": 2
  }
]

Style values (pick the closest match):
- "Question N" → style: "QUESTION_N"
- "NUMERICAL N" → style: "NUMERICAL_N"  
- "N.Title:" → style: "N_DOT_TITLE"
- "N. Description" → style: "N_DOT_DESC"
- "Q N" → style: "Q_N"
- "Problem N" → style: "PROBLEM_N"
- "Section N" → style: "SECTION_N"
- "Exercise N" → style: "EXERCISE_N"
- other → style: "OTHER"

Important: Only include actual content items, not table of contents entries or page headers.`;

    const response = await provider.generateText(prompt);
    let rawText = response.text.trim();

    // Strip any ```json ``` fences before parsing
    if (rawText.startsWith("```")) {
      rawText = rawText.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
    }

    const parsed = JSON.parse(rawText);
    if (!Array.isArray(parsed)) {
      console.warn("[DocumentIndexer] Response is not a JSON array.");
      return [];
    }

    return parsed.map((item: any) => ({
      number: String(item.number ?? ""),
      title: String(item.title ?? ""),
      style: String(item.style ?? ""),
      approximate_page: Number(item.approximate_page ?? 1),
      document_id: documentId,
      file_name: fileName,
    }));
  } catch (error) {
    console.warn("[DocumentIndexer] Failed: " + error);
    return [];
  }
}
