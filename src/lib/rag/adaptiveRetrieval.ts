export interface GeminiResult {
  text: string;
  promptTokens: number;
}

/**
 * Standard utility to query Gemini v1beta endpoint and retrieve response text + token metadata.
 */
export async function callGemini(
  prompt: string,
  apiKey: string,
  systemInstruction?: string
): Promise<GeminiResult> {
  const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const payload: {
    contents: { parts: { text: string }[] }[];
    systemInstruction?: { parts: { text: string }[] };
  } = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  const response = await fetch(geminiEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API call failed with status ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const promptTokens = data.usageMetadata?.promptTokenCount || Math.ceil((prompt.length + (systemInstruction?.length || 0)) / 4.2);

  return { text, promptTokens };
}

/**
 * Extracts normalized keyword lists from a query string.
 */
export function extractKeywords(query: string): string[] {
  const stopWords = new Set([
    "what", "which", "where", "when", "this", "that", "these", "those",
    "with", "from", "into", "about", "your", "their", "there", "here",
    "them", "then", "than", "list", "show", "find", "questions", "question",
    "explain", "summarize", "page", "contains", "problems", "topics"
  ]);
  
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length >= 3 && !stopWords.has(w));
}
