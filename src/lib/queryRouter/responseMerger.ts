/**
 * Merges multiple responses into a single Markdown response.
 */
export function mergeResponses(
  responses: { query: string; answer: string; success: boolean }[]
): string {
  return responses
    .map((res) => {
      let content = res.answer.trim();
      if (!res.success) {
        content = `*Could not resolve this part: "${res.query}" due to a processing error.*`;
      }

      if (!content.startsWith("#")) {
        const heading = res.query.charAt(0).toUpperCase() + res.query.slice(1);
        return `### ${heading}\n\n${content}`;
      }

      return content;
    })
    .join("\n\n---\n\n");
}
