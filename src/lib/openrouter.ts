/**
 * OpenRouter AI Client
 * Uses the free OpenAI-compatible API from openrouter.ai
 * Supports multi-key rotation and automatic retry across pool of keys.
 * Default free model: openrouter/free (dynamically routes to best active free model)
 */

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_MODEL = "openrouter/free";
const MAX_OPENROUTER_RESPONSE_BYTES = 500_000;

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

function extractMessageContent(rawContent: unknown): string {
  if (typeof rawContent === "string") {
    return rawContent.trim();
  }
  if (Array.isArray(rawContent)) {
    return rawContent
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
          return (part as { text: string }).text;
        }
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

export async function callOpenRouter(
  messages: OpenRouterMessage[],
  model: string = DEFAULT_MODEL,
  jsonMode: boolean = false
): Promise<string> {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("At least one message is required to call OpenRouter.");
  }

  const keys = getOpenRouterKeys();
  if (keys.length === 0) {
    throw new Error(
      "No OpenRouter API key found. Please set OPENROUTER_API_KEY or OPENROUTER_API_KEY_1 in your environment variables."
    );
  }

  const preferredModel = typeof model === "string" ? model.trim() : "";
  const candidateModels = [preferredModel, "openrouter/free", "google/gemma-4-26b-a4b-it:free"]
    .filter((v): v is string => Boolean(v))
    .filter((v, i, a) => a.indexOf(v) === i);

  let lastError: Error | null = null;
  const startIndex = currentKeyIndex % keys.length;
  const deadline = Date.now() + 60_000;

  for (let attempt = 0; attempt < keys.length; attempt++) {
    if (Date.now() >= deadline) break;
    const keyIdx = (startIndex + attempt) % keys.length;
    const apiKey = keys[keyIdx];

    for (const currentModel of candidateModels) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      try {
        const body: Record<string, unknown> = {
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
          signal: AbortSignal.timeout(Math.min(20_000, remainingMs)),
        });

        if (!res.ok) {
          const errorBody = (await res.text()).slice(0, 400);
          console.warn(`OpenRouter key #${keyIdx + 1} with model ${currentModel} returned ${res.status}: ${errorBody}`);
          lastError = new Error(`OpenRouter request failed with status ${res.status}.`);
          if (res.status === 401 || res.status === 402 || res.status === 403) {
            break; // Key-level failure: move directly to the next API key
          }
          continue; // Model-level or transient failure: try next candidate model
        }

        const contentLength = Number(res.headers.get("content-length") || 0);
        if (Number.isFinite(contentLength) && contentLength > MAX_OPENROUTER_RESPONSE_BYTES) {
          lastError = new Error("OpenRouter response exceeded the safety size limit.");
          continue;
        }

        const rawText = await res.text();
        if (rawText.length > MAX_OPENROUTER_RESPONSE_BYTES) {
          lastError = new Error("OpenRouter response exceeded the safety size limit.");
          continue;
        }

        const data = JSON.parse(rawText);
        if (data?.error) {
          console.warn(`OpenRouter inner error on ${currentModel}:`, data.error);
          lastError = new Error(`OpenRouter model ${currentModel} returned an inner error.`);
          continue;
        }

        const content = extractMessageContent(data?.choices?.[0]?.message?.content);
        if (!content) {
          lastError = new Error("OpenRouter returned an empty response.");
          continue;
        }

        // Success!
        currentKeyIndex = (keyIdx + 1) % keys.length;
        return content;
      } catch (err: any) {
        lastError = err instanceof Error ? err : new Error("OpenRouter request failed.");
        console.warn(`Attempt with key #${keyIdx + 1} and model ${currentModel} failed:`, lastError.message);
      }
    }
  }

  throw lastError || new Error("All configured OpenRouter API keys and models failed.");
}

function tryParseCandidateJson<T>(candidate: string): { ok: true; value: T } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(candidate) as T };
  } catch {
    try {
      const sanitized = candidate
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, (c) => (c === "\n" || c === "\r" || c === "\t" ? c : ""));
      return { ok: true, value: JSON.parse(sanitized) as T };
    } catch {
      return { ok: false };
    }
  }
}

/**
 * Parse JSON from OpenRouter response — robustly handles markdown fences,
 * conversational preambles ("Here is the JSON:"), postscripts, and formatting quirks.
 */
export function parseJsonResponse<T>(raw: string): T {
  if (!raw || typeof raw !== "string") {
    throw new Error("Invalid response received from AI model: empty or non-string output.");
  }
  if (raw.length > 100_000) {
    throw new Error("AI response exceeded the 100,000-character safety limit.");
  }

  // Models sometimes emit LaTeX commands with a single backslash inside a
  // JSON string (including compound commands like \textemptyset or \neq that
  // collide with JSON escapes \t, \n, \f, \r, \b). Escape known commands before
  // JSON.parse; leave already escaped JSON backslashes and standard escapes untouched.
  const text = raw.trim().replace(
    /(?<!\\)\\(text[a-zA-Z]*|frac|forall|theta|tau|tan|times|to|top|triangle|beta|bar|begin|binom|big[a-zA-Z]*|right[a-zA-Z]*|rho|left[a-zA-Z]*|nabla|neq|notin|nu|sqrt|sum|int|cdot|alpha|gamma|delta|lambda|mu|pi|sigma|omega|phi|varphi|varepsilon|emptyset|varnothing|mathrm|mathbf|overline|underline|end|operatorname|infty|partial|approx|leq|geq|mathbb|mathcal)\b/g,
    "\\\\$1"
  );

  // 1. Direct parse attempt if clean JSON
  const direct = tryParseCandidateJson<T>(text);
  if (direct.ok) return direct.value;

  // 2. Extract from outer markdown code fences (greedy first to preserve inner code blocks)
  const greedyFenceMatch = text.match(/```(?:json)?\s*([\s\S]*)\s*```/i);
  if (greedyFenceMatch && greedyFenceMatch[1]) {
    const parsedFence = tryParseCandidateJson<T>(greedyFenceMatch[1].trim());
    if (parsedFence.ok) return parsedFence.value;
  }

  const nonGreedyFenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (nonGreedyFenceMatch && nonGreedyFenceMatch[1]) {
    const parsedFence = tryParseCandidateJson<T>(nonGreedyFenceMatch[1].trim());
    if (parsedFence.ok) return parsedFence.value;
  }

  // 3. Extract the widest valid JSON structure (object or array) from intact text
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
    const parsedWide = tryParseCandidateJson<T>(candidate);
    if (parsedWide.ok) return parsedWide.value;
  }

  console.warn("Failed to parse AI JSON response snippet:", text.slice(0, 200));
  throw new Error("Failed to parse structured JSON response from AI model.");
}
