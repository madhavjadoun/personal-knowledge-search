import { LLMProvider } from "../answerEngine/providers";
import { ConceptItem } from "./types";

export interface ExtractionResult {
  topics: string[];
  concepts: ConceptItem[];
}

/**
 * Extracts unique major topics and key concepts discussed in the document.
 */
export async function extractTopicsAndConcepts(
  textSample: string,
  llmProvider: LLMProvider
): Promise<ExtractionResult> {
  const prompt = `You are a document analyzer. Identify the major topics and important concepts from the text.
Extract concepts generic to the document (e.g. algorithms, models, definitions, frameworks, techniques, formulas, libraries).

Follow this output format exactly:
TOPICS:
- [Topic Name 1]
- [Topic Name 2]

CONCEPTS:
- [Concept Name 1] | [Category] | [Short Description]
- [Concept Name 2] | [Category] | [Short Description]

Allowed Categories for Concepts: Algorithm, Framework, Model, Definition, Technique, Formula, Library, Other.

Do not write any introductory or concluding remarks. Just the format above.

Document Text Sample:
${textSample}

Extraction:`.trim();

  const result: ExtractionResult = { topics: [], concepts: [] };

  try {
    const rawOutput = await llmProvider.generate(prompt);
    const lines = rawOutput.split("\n");
    let currentSection: "topics" | "concepts" | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.toUpperCase().startsWith("TOPICS:")) {
        currentSection = "topics";
        continue;
      }
      if (trimmed.toUpperCase().startsWith("CONCEPTS:")) {
        currentSection = "concepts";
        continue;
      }

      if (!trimmed || (!trimmed.startsWith("-") && !trimmed.startsWith("*"))) {
        continue;
      }

      const content = trimmed.substring(1).trim(); // remove bullet

      if (currentSection === "topics") {
        if (content && !result.topics.includes(content)) {
          result.topics.push(content);
        }
      } else if (currentSection === "concepts") {
        const parts = content.split("|").map((p) => p.trim());
        if (parts.length >= 1 && parts[0]) {
          const name = parts[0];
          const rawCat = parts[1] || "Other";
          const desc = parts[2] || "Mentioned in the document.";

          // Normalize category
          let category: ConceptItem["category"] = "Other";
          const cats: ConceptItem["category"][] = [
            "Algorithm",
            "Framework",
            "Model",
            "Definition",
            "Technique",
            "Formula",
            "Library",
            "Other",
          ];
          const matched = cats.find((c) => c.toLowerCase() === rawCat.toLowerCase());
          if (matched) {
            category = matched;
          }

          result.concepts.push({ name, category, description: desc });
        }
      }
    }
  } catch (err) {
    console.error("[DocIntel] Failed to extract topics/concepts:", err);
  }

  // Fallbacks if LLM returned nothing or bad format
  if (result.topics.length === 0) {
    result.topics = ["General Knowledge Extraction"];
  }
  if (result.concepts.length === 0) {
    result.concepts = [
      {
        name: "General Concept",
        category: "Other",
        description: "Concepts discussed in document.",
      },
    ];
  }

  return result;
}
