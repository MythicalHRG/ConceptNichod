import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("prompt escaping neutralizes tag delimiters in untrusted model context", () => {
  const helper = fs.readFileSync("src/lib/prompt-safety.ts", "utf8");
  assert.match(helper, /replace\(\/&\/g, "&amp;"\)\.replace\(\/<\/g, "&lt;"\)\.replace\(\/>\/g, "&gt;"\)/);
  const concept = fs.readFileSync("src/ai/flows/analyze-concept-explanation.ts", "utf8");
  assert.match(concept, /const promptTranscript = escapePromptText\(safeTranscript\)/);
  assert.match(concept, /\$\{promptTranscript\}/);
  const answers = fs.readFileSync("src/ai/flows/analyze-answers.ts", "utf8");
  assert.match(answers, /escapePromptText\(\(a\.answer \|\| ""\)\.slice\(0, 3000\)\)/);
  assert.match(answers, /\$\{escapePromptText\(boundedSummary\)\}/);
  const questions = fs.readFileSync("src/ai/flows/generate-questions.ts", "utf8");
  assert.match(questions, /\$\{escapePromptText\(boundedSummary\)\}/);
});

test("mistake quiz generation is rate-limited and validates model output shape", () => {
  const source = fs.readFileSync("src/app/actions/mistakes.ts", "utf8");
  assert.match(source, /checkDistributedRateLimit\(`mistake-quiz:\$\{user\.uuid\}`, 5, 15 \* 60 \* 1000\)/);
  assert.match(source, /parsed\.questions\.length !== 3/);
  assert.match(source, /question\.options\.length !== 4/);
  assert.match(source, /Number\.isInteger\(question\.correctIndex\)/);
  assert.match(source, /escapePromptText\(\(d\.myMistake \|\| ""\)\.slice\(0, 500\)\)/);
});
