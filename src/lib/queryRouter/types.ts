export type IntentType =
  | "DOCUMENT_SUMMARY"
  | "DOCUMENT_OVERVIEW"
  | "TOPIC_LIST"
  | "CONCEPT_LIST"
  | "METADATA"
  | "QUESTION_COUNT"
  | "RETRIEVAL_QUESTION"
  | "COMPARISON"
  | "EXPLANATION"
  | "DEFINITION";

export interface Intent {
  query: string;
  type: IntentType;
  routedTarget: "DOC_INTEL" | "SEMANTIC_RAG";
}
