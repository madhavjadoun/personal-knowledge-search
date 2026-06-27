/**
 * LLM Provider abstraction for the Answer Engine.
 *
 * Design mirrors the Embedding Provider pattern:
 *   - A common interface (LLMProvider) that all providers implement.
 *   - A factory function (createLLMProvider) that reads env vars and
 *     instantiates the correct provider.
 *   - No provider-specific logic leaks outside this file.
 *
 * Currently supported providers:
 *   - "ollama"  → OllamaLLMProvider (default for development)
 *
 * Future providers (not yet implemented) can be added here:
 *   - "google"  → GeminiLLMProvider
 *   - "openai"  → OpenAILLMProvider
 */

// ── Typed errors ──────────────────────────────────────────────────────────────

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

// ── Provider interface ────────────────────────────────────────────────────────

/**
 * Every LLM provider must implement this interface.
 * The Answer Generator only ever calls generate() — it has no knowledge of
 * which underlying service is being used.
 */
export interface LLMProvider {
  /** Human-readable provider label, e.g. "ollama" or "google". */
  readonly name: string;
  /** Active model identifier, e.g. "qwen2.5:3b". */
  readonly modelName: string;
  /**
   * Generate a response from the given fully-assembled prompt string.
   * The prompt must come from PromptBuilder.fullPrompt — never pass a raw user
   * query here.
   *
   * @param prompt - The complete, grounded prompt (system + context + question).
   * @returns      - The trimmed LLM text response.
   * @throws       - An AnswerEngineError object on any failure.
   */
  generate(prompt: string): Promise<string>;
}

// ── Ollama provider ───────────────────────────────────────────────────────────

/**
 * Ollama LLM provider.
 *
 * Calls the local Ollama REST API with stream=false and returns the complete
 * response text synchronously (from the caller's perspective).
 *
 * Env vars consumed:
 *   OLLAMA_BASE_URL   — e.g. http://127.0.0.1:11434  (required)
 *   LLM               — e.g. qwen2.5:3b               (required)
 */
class OllamaLLMProvider implements LLMProvider {
  readonly name = "ollama";
  readonly modelName: string;
  private readonly baseUrl: string;

  constructor() {
    const baseUrl = process.env.OLLAMA_BASE_URL;
    const model = process.env.LLM;

    if (!baseUrl || baseUrl.trim() === "") {
      throw makeError(
        "LLM_UNAVAILABLE",
        "Missing OLLAMA_BASE_URL environment variable for Ollama LLM provider."
      );
    }
    if (!model || model.trim() === "") {
      throw makeError(
        "LLM_UNAVAILABLE",
        "Missing LLM environment variable — set it to the Ollama model name (e.g. qwen2.5:3b)."
      );
    }

    this.baseUrl = baseUrl.replace(/\/$/, ""); // strip trailing slash
    this.modelName = model.trim();
  }

  async generate(prompt: string): Promise<string> {
    const url = `${this.baseUrl}/api/generate`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.modelName,
          prompt,
          stream: false,
        }),
      });
    } catch (networkErr) {
      const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
      throw makeError(
        "LLM_UNAVAILABLE",
        `Ollama is not reachable at ${url}. Make sure Ollama is running. Error: ${msg}`
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "(no body)");
      throw makeError(
        "GENERATION_FAILED",
        `Ollama returned HTTP ${response.status}. Body: ${body.slice(0, 300)}`
      );
    }

    let json: Record<string, unknown>;
    try {
      json = (await response.json()) as Record<string, unknown>;
    } catch {
      throw makeError("INVALID_RESPONSE", "Ollama response is not valid JSON.");
    }

    if (typeof json.response !== "string") {
      throw makeError(
        "INVALID_RESPONSE",
        `Ollama response JSON is missing the "response" field. Got: ${JSON.stringify(json).slice(0, 200)}`
      );
    }

    const text = (json.response as string).trim();
    if (text.length === 0) {
      throw makeError("EMPTY_RESPONSE", "Ollama returned an empty response string.");
    }

    return text;
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Reads the LLM_PROVIDER env var (defaults to "ollama") and returns the
 * correct provider instance.
 *
 * This is the ONLY place where provider classes are instantiated.
 * All other code must use createLLMProvider() and work against LLMProvider.
 */
export function createLLMProvider(): LLMProvider {
  const provider = (process.env.LLM_PROVIDER || "ollama").toLowerCase().trim();

  console.log(`[AnswerEngine] LLM Provider: ${provider}`);

  switch (provider) {
    case "ollama":
      return new OllamaLLMProvider();

    // Future providers:
    // case "google":
    //   return new GeminiLLMProvider();
    // case "openai":
    //   return new OpenAILLMProvider();

    default:
      throw makeError(
        "LLM_UNAVAILABLE",
        `Unknown LLM_PROVIDER value: "${provider}". Supported values: ollama`
      );
  }
}
