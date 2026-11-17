import assert from "node:assert";
import test from "node:test";

// Simulating parseJsonResponse from src/lib/openrouter.ts
function parseJsonResponse(raw) {
  if (!raw || typeof raw !== "string") {
    throw new Error("Invalid response received from AI model: empty or non-string output.");
  }

  let text = raw.trim().replace(
    /(?<!\\)\\(frac|theta|beta|right|left|nabla|sqrt|sum|int|cdot|times|alpha|gamma|delta|lambda|mu|pi|sigma|omega|text|mathrm|mathbf|overline|underline|begin|end|operatorname|infty|partial|approx|neq|leq|geq|rightarrow|mathbb|mathcal)\b/g,
    "\\\\$1"
  );

  // 1. Direct parse attempt if clean JSON
  try {
    return JSON.parse(text);
  } catch {}

  // 2. Extract from markdown code fences (```json ... ``` or ``` ... ```)
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch && fenceMatch[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
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
      return JSON.parse(candidate);
    } catch {
      const sanitized = candidate
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, (c) => (c === "\n" || c === "\r" || c === "\t" ? c : ""));
      return JSON.parse(sanitized);
    }
  }

  throw new Error(`Failed to parse AI JSON response.`);
}

test("Tareeka 1: AI JSON parser withstands conversational preambles and postscripts", () => {
  const llmOutput = `Here is the requested topic summary in JSON format:
\`\`\`json
{
  "summary": "Photosynthesis is the process by which green plants make food.",
  "subtopics": [
    { "title": "Light Reactions", "explanation": "Occurs in thylakoids" },
    { "title": "Calvin Cycle", "explanation": "Synthesizes glucose" }
  ],
  "daily_life_analogy": "Like a solar-powered kitchen making snacks."
}
\`\`\`
I hope this detailed breakdown helps the student clear all their doubts!`;

  const result = parseJsonResponse(llmOutput);
  assert.strictEqual(typeof result, "object");
  assert.strictEqual(result.subtopics.length, 2);
  assert.ok(result.summary.includes("Photosynthesis"));
});

test("Tareeka 1: AI JSON parser extracts valid JSON without markdown fences", () => {
  const conversationalWithoutFences = `Sure! Here you go:
  {"title": "Newton's Second Law", "formula": "F = ma"}
  Let me know if you need any follow-up calculations!`;

  const result = parseJsonResponse(conversationalWithoutFences);
  assert.strictEqual(result.title, "Newton's Second Law");
  assert.strictEqual(result.formula, "F = ma");
});

test("Tareeka 1: AI JSON parser handles trailing commas produced by LLMs", () => {
  const invalidJsonWithTrailingComma = `{"name": "Thermodynamics", "difficulty": "Medium",}`;
  const result = parseJsonResponse(invalidJsonWithTrailingComma);
  assert.strictEqual(result.name, "Thermodynamics");
});


test("AI JSON parser preserves unescaped LaTeX commands inside JSON strings", () => {
  const raw = String.raw`{"formula":"\frac{a}{b} + \theta + \beta + \right) + \nabla f"}`;
  const result = parseJsonResponse(raw);
  assert.equal(result.formula, String.raw`\frac{a}{b} + \theta + \beta + \right) + \nabla f`);
});
