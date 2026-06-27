import { callGemini, GeminiResult } from "./adaptiveRetrieval";

export interface AIProvider {
  name: string;
  generateAnswer(
    question: string,
    retrievedChunks: { page_number: number; content: string }[]
  ): Promise<GeminiResult>;
  
  generateText(
    prompt: string,
    systemInstruction?: string
  ): Promise<GeminiResult>;
}

export class GeminiProvider implements AIProvider {
  readonly name = "Gemini";
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateText(prompt: string, systemInstruction?: string): Promise<GeminiResult> {
    return callGemini(prompt, this.apiKey, systemInstruction);
  }

  async generateAnswer(
    question: string,
    retrievedChunks: { page_number: number; content: string }[]
  ): Promise<GeminiResult> {
    const contextText = retrievedChunks.map((c) => `[Page ${c.page_number}]:\n${c.content}`).join("\n\n");
    const userPrompt = `Context:\n${contextText}\n\nQuestion:\n${question}`;
    
    const finalSystemInstruction = `You are a document intelligence assistant.
Answer ONLY using the provided document context.
Never hallucinate.
If the answer is not found in the provided context, explicitly say:
"I couldn't find this information in the uploaded document."
For document-level requests:
Return complete information.
Never truncate the response unnecessarily.
If the response becomes too long, structure it using headings and bullet points.`;

    return this.generateText(userPrompt, finalSystemInstruction);
  }
}

let isOllamaVerified = false;

export class OllamaProvider implements AIProvider {
  readonly name = "Ollama (Development)";
  private readonly model = "qwen2.5:3b";
  private readonly endpoint = "http://localhost:11434/api/chat";

  async generateText(prompt: string, systemInstruction?: string): Promise<GeminiResult> {
    // 1. Verify if Ollama server is running by querying /api/tags (cached after first success)
    if (!isOllamaVerified) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 seconds timeout
        
        const tagsResponse = await fetch("http://localhost:11434/api/tags", {
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!tagsResponse.ok) {
          throw new Error("Ollama tags check failed");
        }

        const tagsData = await tagsResponse.json();
        const models = tagsData.models || [];
        const hasModel = models.some((m: { name: string }) => 
          m.name === this.model || m.name.startsWith(`${this.model}:`)
        );

        if (!hasModel) {
          throw new Error(`Model ${this.model} is not installed. Run: ollama pull ${this.model}`);
        }

        isOllamaVerified = true;

      } catch (err) {
        if (err instanceof Error && err.message.includes("is not installed")) {
          throw err;
        }
        throw new Error("Ollama server is not running. Please start it using 'ollama serve'.");
      }
    }

    // 2. Query Ollama Chat API
    const messages = [];
    if (systemInstruction) {
      messages.push({
        role: "system",
        content: systemInstruction,
      });
    }
    messages.push({
      role: "user",
      content: prompt,
    });

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        options: {
          temperature: 0.2,
        },
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API call failed: ${response.statusText} (${response.status}) - ${errorText}`);
    }

    const data = await response.json();
    const text = data.message?.content || "";
    const promptTokens = data.prompt_eval_count || Math.ceil(prompt.length / 4.2);

    return {
      text,
      promptTokens,
    };
  }

  async generateAnswer(
    question: string,
    retrievedChunks: { page_number: number; content: string }[]
  ): Promise<GeminiResult> {
    const contextText = retrievedChunks.map((c) => `[Page ${c.page_number}]:\n${c.content}`).join("\n\n");
    const userPrompt = `Context:\n${contextText}\n\nQuestion:\n${question}`;
    
    const finalSystemInstruction = `Answer only using the context below. If the answer is not in the context, say: "I couldn't find this information in the uploaded document." Do not invent facts.`;

    return this.generateText(userPrompt, finalSystemInstruction);
  }
}

export function getAIProvider(): AIProvider {
  const providerType = process.env.AI_PROVIDER;
  if (providerType === "ollama") {
    return new OllamaProvider();
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY environment variable. Please configure it in your .env.local file.");
  }
  return new GeminiProvider(apiKey);
}
