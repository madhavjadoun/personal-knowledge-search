export interface AnswerEngineError {
  code:
  | "LLM_UNAVAILABLE"
  | "GENERATION_FAILED"
  | "EMPTY_RESPONSE"
  | "INVALID_RESPONSE";
  message: string;
}

function makeError(code: AnswerEngineError["code"], message: string): AnswerEngineError {
  return { code, message };
}

export interface LLMProvider {
  readonly name: string;
  readonly modelName: string;
  generate(prompt: string): Promise<string>;
}

// ── Ollama ────────────────────────────────────────────────────────────────────

class OllamaLLMProvider implements LLMProvider {
  readonly name = "ollama";
  readonly modelName: string;
  private readonly baseUrl: string;

  constructor() {
    const baseUrl = process.env.OLLAMA_BASE_URL;
    const model = process.env.LLM;

    if (!baseUrl || baseUrl.trim() === "") {
      throw makeError("LLM_UNAVAILABLE", "Missing OLLAMA_BASE_URL environment variable.");
    }
    if (!model || model.trim() === "") {
      throw makeError("LLM_UNAVAILABLE", "Missing LLM environment variable (e.g. qwen2.5:3b).");
    }

    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.modelName = model.trim();
  }

  async generate(prompt: string): Promise<string> {
    const url = `${this.baseUrl}/api/generate`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.modelName, prompt, stream: false }),
      });
    } catch (networkErr) {
      const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
      throw makeError("LLM_UNAVAILABLE", `Ollama not reachable at ${url}. Error: ${msg}`);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "(no body)");
      throw makeError("GENERATION_FAILED", `Ollama HTTP ${response.status}. Body: ${body.slice(0, 300)}`);
    }

    let json: Record<string, unknown>;
    try {
      json = (await response.json()) as Record<string, unknown>;
    } catch {
      throw makeError("INVALID_RESPONSE", "Ollama response is not valid JSON.");
    }

    if (typeof json.response !== "string") {
      throw makeError("INVALID_RESPONSE", `Missing "response" field. Got: ${JSON.stringify(json).slice(0, 200)}`);
    }

    const text = (json.response as string).trim();
    if (text.length === 0) {
      throw makeError("EMPTY_RESPONSE", "Ollama returned empty response.");
    }

    return text;
  }
}

// ── Groq ──────────────────────────────────────────────────────────────────────
class GroqLLMProvider implements LLMProvider {
  readonly name = "groq";
  readonly modelName = "llama-3.1-8b-instant";

  async generate(prompt: string): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey.trim() === "") {
      throw makeError("LLM_UNAVAILABLE", "Missing GROQ_API_KEY environment variable.");
    }

    let response: Response;
    try {
      response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_tokens: 4000,
        }),
      });
    } catch (networkErr) {
      const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
      throw makeError("LLM_UNAVAILABLE", `Groq not reachable. Error: ${msg}`);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "(no body)");
      throw makeError("GENERATION_FAILED", `Groq HTTP ${response.status}. Body: ${body.slice(0, 300)}`);
    }

    let json: Record<string, unknown>;
    try {
      json = (await response.json()) as Record<string, unknown>;
    } catch {
      throw makeError("INVALID_RESPONSE", "Groq response is not valid JSON.");
    }

    const choices = json.choices as Array<{ message: { content: string } }>;
    if (!choices || choices.length === 0) {
      throw makeError("INVALID_RESPONSE", "Groq returned no choices.");
    }

    const text = choices[0].message.content.trim();
    if (text.length === 0) {
      throw makeError("EMPTY_RESPONSE", "Groq returned empty response.");
    }

    return text;
  }
}

// ── Gemini ────────────────────────────────────────────────────────────────────

class GeminiLLMProvider implements LLMProvider {
  readonly name = "gemini";
  readonly modelName = "gemini-1.5-flash";

  async generate(prompt: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim() === "") {
      throw makeError("LLM_UNAVAILABLE", "Missing GEMINI_API_KEY environment variable.");
    }

    let response: Response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 4000 },
          }),
        }
      );
    } catch (networkErr) {
      const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
      throw makeError("LLM_UNAVAILABLE", `Gemini not reachable. Error: ${msg}`);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "(no body)");
      throw makeError("GENERATION_FAILED", `Gemini HTTP ${response.status}. Body: ${body.slice(0, 300)}`);
    }

    let json: Record<string, unknown>;
    try {
      json = (await response.json()) as Record<string, unknown>;
    } catch {
      throw makeError("INVALID_RESPONSE", "Gemini response is not valid JSON.");
    }

    const candidates = json.candidates as Array<{ content: { parts: Array<{ text: string }> } }>;
    if (!candidates || candidates.length === 0) {
      throw makeError("INVALID_RESPONSE", "Gemini returned no candidates.");
    }

    const text = candidates[0].content.parts[0].text.trim();
    if (text.length === 0) {
      throw makeError("EMPTY_RESPONSE", "Gemini returned empty response.");
    }

    return text;
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createLLMProvider(): LLMProvider {
  const provider = (process.env.LLM_PROVIDER || "ollama").toLowerCase().trim();

  console.log(`[AnswerEngine] LLM Provider: ${provider}`);

  switch (provider) {
    case "ollama":
      return new OllamaLLMProvider();
    case "groq":
      return new GroqLLMProvider();
    case "gemini":
      return new GeminiLLMProvider();
    default:
      throw makeError(
        "LLM_UNAVAILABLE",
        `Unknown LLM_PROVIDER: "${provider}". Supported: ollama, groq, gemini`
      );
  }
}