/**
 * OpenRouter AI Client
 * Uses the free OpenAI-compatible API from openrouter.ai
 * Supports multi-key rotation and automatic retry across pool of keys.
 * Default free model: openrouter/free (dynamically routes to best active free model)
 */

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_MODEL = "openrouter/free";

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

let currentKeyIndex = 0;

/**
 * Returns all configured OpenRouter API keys from environment variables.
 */
function getOpenRouterKeys(): string[] {
  const keys: string[] = [];

  // Comma-separated list if provided
  if (process.env.OPENROUTER_API_KEYS) {
    keys.push(
      ...process.env.OPENROUTER_API_KEYS.split(",")
        .map((k) => k.trim())
        .filter(Boolean)
    );
  }

  // Individual numbered keys (1 to 10)
  for (let i = 1; i <= 10; i++) {
    const k = process.env[`OPENROUTER_API_KEY_${i}`];
    if (k && k.trim()) keys.push(k.trim());
  }

  // Base singular key
  if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim()) {
    keys.push(process.env.OPENROUTER_API_KEY.trim());
  }

  // Deduplicate
  return Array.from(new Set(keys));
}

export async function callOpenRouter(
  messages: OpenRouterMessage[],
  model: string = DEFAULT_MODEL,
  jsonMode: boolean = false
): Promise<string> {
  const keys = getOpenRouterKeys();
  if (keys.length === 0) {
    throw new Error(
      "No OpenRouter API key found. Please set OPENROUTER_API_KEY or OPENROUTER_API_KEY_1 in your environment variables."
    );
  }

  const candidateModels = [model, "openrouter/free", "google/gemma-4-26b-a4b-it:free"].filter(
    (v, i, a) => a.indexOf(v) === i
  );

  let lastError: Error | null = null;
  const startIndex = currentKeyIndex % keys.length;

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const keyIdx = (startIndex + attempt) % keys.length;
    const apiKey = keys[keyIdx];

    for (const currentModel of candidateModels) {
      try {
        const body: any = {
          model: currentModel,
          messages,
        };

        if (jsonMode) {
          body.response_format = { type: "json_object" };
        }

        const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://conceptnichod.vercel.app",
            "X-Title": "ConceptNichod",
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errorBody = await res.text();
          console.warn(`OpenRouter key #${keyIdx + 1} with model ${currentModel} returned ${res.status}: ${errorBody}`);
          if (res.status === 429 || res.status === 404 || res.status === 401) {
            lastError = new Error(`Key #${keyIdx + 1} / Model ${currentModel} error: ${res.status}`);
            continue; // try next candidate model or key
          }
          throw new Error(`OpenRouter API error: ${res.status} - ${errorBody}`);
        }

        const data = await res.json();
        if (data.error) {
          console.warn(`OpenRouter inner error on ${currentModel}:`, data.error);
          continue;
        }

        const content = data.choices?.[0]?.message?.content;
        if (!content) {
          throw new Error("OpenRouter returned an empty response.");
        }

        // Success!
        currentKeyIndex = (keyIdx + 1) % keys.length;
        return content;
      } catch (err: any) {
        lastError = err;
        console.warn(`Attempt with key #${keyIdx + 1} and model ${currentModel} failed:`, err.message);
      }
    }
  }

  throw lastError || new Error("All configured OpenRouter API keys and models failed.");
}

/**
 * Parse JSON from OpenRouter response — robustly handles markdown fences,
 * conversational preambles ("Here is the JSON:"), postscripts, and formatting quirks.
 */
export function parseJsonResponse<T>(raw: string): T {
  if (!raw || typeof raw !== "string") {
    throw new Error("Invalid response received from AI model: empty or non-string output.");
  }

  let text = raw.trim();

  // 1. Direct parse attempt if clean JSON
  try {
    return JSON.parse(text) as T;
  } catch {
    // Continue to extractors
  }

  // 2. Extract from markdown code fences (```json ... ``` or ``` ... ```)
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch && fenceMatch[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as T;
    } catch {
      text = fenceMatch[1].trim();
    }
  }

  // 3. Extract the widest valid JSON structure (object or array)
  const firstBrace = text.indexOf("{");
  const firstBracket = text.indexOf("[");
  let startIdx = -1;
  let endIdx = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    endIdx = text.lastIndexOf("}");
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    endIdx = text.lastIndexOf("]");
  }

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const candidate = text.substring(startIdx, endIdx + 1).trim();
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Clean up common LLM artifacts like trailing commas before closing braces
      const sanitized = candidate
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, (c) => (c === "\n" || c === "\r" || c === "\t" ? c : ""));
      return JSON.parse(sanitized) as T;
    }
  }

  throw new Error(`Failed to parse AI JSON response. Raw output was: ${text.slice(0, 200)}...`);
}
