import { HybridCandidate } from "./hybridSearch";

/**
 * Reranks candidate chunks using a combination of semantic similarity, phrase alignment, and keyword density.
 */
export function rerankCandidates(
  candidates: HybridCandidate[],
  normalizedQuery: string,
  keywords: string[]
): HybridCandidate[] {
  if (candidates.length === 0) return [];

  const lowerQuery = normalizedQuery.toLowerCase().trim();

  const reranked = candidates.map((c) => {
    const lowerContent = c.content.toLowerCase();

    // 1. Phrase Match Score: 1.0 if the query is contained exactly, otherwise 0.
    const hasPhraseMatch = lowerContent.includes(lowerQuery);
    const phraseScore = hasPhraseMatch ? 1.0 : 0.0;

    // 2. Keyword Density Match: check matching keywords ratio
    let matchCount = 0;
    for (const kw of keywords) {
      if (lowerContent.includes(kw)) {
        matchCount++;
      }
    }
    const keywordDensity = keywords.length > 0 ? matchCount / keywords.length : 0;

    // 3. Composite Rerank Score
    // Blends 50% semantic similarity, 30% phrase alignment, and 20% keyword density
    const rerankScore = 0.5 * c.similarity + 0.3 * phraseScore + 0.2 * keywordDensity;

    return {
      ...c,
      rerankScore,
    };
  });

  // Sort by composite rerankScore descending with stable fallback tie-breakers
  reranked.sort((a, b) => {
    if (b.rerankScore !== a.rerankScore) return b.rerankScore - a.rerankScore;
    if (a.page_number !== b.page_number) return a.page_number - b.page_number;
    if (a.chunk_index !== b.chunk_index) return a.chunk_index - b.chunk_index;
    return a.id.localeCompare(b.id);
  });

  return reranked;
}
