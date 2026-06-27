import { detectDocumentQuery } from "../documentIntelligence";
import { Intent, IntentType } from "./types";

/**
 * Classifies an intent query and assigns its routed target.
 */
export function classifyIntent(query: string): Intent {
  const q = query.trim().toLowerCase();
  const isDocIntel = detectDocumentQuery(query);

  let type: IntentType = "RETRIEVAL_QUESTION";

  if (isDocIntel) {
    if (/\b(summarize|summary)\b/i.test(q)) {
      type = "DOCUMENT_SUMMARY";
    } else if (/\b(overview|about)\b/i.test(q)) {
      type = "DOCUMENT_OVERVIEW";
    } else if (/\b(topics)\b/i.test(q)) {
      type = "TOPIC_LIST";
    } else if (/\b(concepts)\b/i.test(q)) {
      type = "CONCEPT_LIST";
    } else if (/\b(questions|question)\b/i.test(q)) {
      type = "QUESTION_COUNT";
    } else {
      type = "METADATA";
    }
  } else {
    if (/\b(compare|contrast|difference|versus|vs)\b/i.test(q)) {
      type = "COMPARISON";
    } else if (/\b(explain|why|how)\b/i.test(q)) {
      type = "EXPLANATION";
    } else if (/\b(what is|define)\b/i.test(q)) {
      type = "DEFINITION";
    }
  }

  return {
    query,
    type,
    routedTarget: isDocIntel ? "DOC_INTEL" : "SEMANTIC_RAG",
  };
}
