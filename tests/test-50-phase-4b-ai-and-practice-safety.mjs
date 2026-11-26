import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("AI generation Server Actions authenticate users, enforce topic ownership, and rate limit", () => {
  const guard = fs.readFileSync("src/lib/ai-flow-auth.ts", "utf8");
  assert.match(guard, /verifySessionCookie\(rawSession\)/);
  assert.match(guard, /mongoose\.isValidObjectId\(topicId\)/);
  assert.match(guard, /Topic\.findOne\(\{ _id: topicId, userId: sessionUuid \}\)/);
  assert.match(guard, /checkDistributedRateLimit\(`topic-ai-flow:\$\{sessionUuid\}`/);
  for (const path of ["src/ai/flows/generate-questions.ts", "src/ai/flows/generate-topic-summary.ts"]) {
    const source = fs.readFileSync(path, "utf8");
    assert.match(source, /requireOwnedTopicGenerationAccess\(input\.topicId\)/, `${path} must enforce owner-only topic access`);
  }
});

test("direct AI analysis flows validate bounded payloads and finite model metrics", () => {
  const analysis = fs.readFileSync("src/ai/flows/analyze-answers.ts", "utf8");
  assert.match(analysis, /checkDistributedRateLimit\(`analyze-answers:\$\{sessionUuid\}`/);
  assert.match(analysis, /writtenAnswers\.length > 10/);
  assert.match(analysis, /spokenAnswers\.length > 11/);
  const mirror = fs.readFileSync("src/ai/flows/analyze-concept-explanation.ts", "utf8");
  assert.match(mirror, /Number\.isFinite\(input\.durationSeconds\)/);
  assert.match(mirror, /Number\.isFinite\(item\.score\)/);
  assert.match(mirror, /Number\.isFinite\(item\.value\)/);
  assert.match(mirror, /Number\.isFinite\(item\.score\)/);
  assert.match(mirror, /polynomial_chart_data: polynomialChartData/);
  assert.match(mirror, /A single oral defense is not a longitudinal learning curve/);
  assert.doesNotMatch(mirror, /Initial Recall.*Math\.max|overallScore \* 1\.08/);
  assert.match(mirror, /output\.feedback_summary = typeof output\.feedback_summary/);
});

test("OpenRouter calls and JSON parsing have hard execution/input bounds", () => {
  const source = fs.readFileSync("src/lib/openrouter.ts", "utf8");
  assert.match(source, /const deadline = Date\.now\(\) \+ 60_000/);
  assert.match(source, /AbortSignal\.timeout\(Math\.min\(20_000, remainingMs\)\)/);
  assert.match(source, /raw\.length > 100_000/);
});

test("KaTeX rendering is untrusted, size-bounded, and expansion-limited", () => {
  const source = fs.readFileSync("src/components/ui/latex-renderer.tsx", "utf8");
  assert.equal((source.match(/trust: false/g) || []).length, 2);
  assert.equal((source.match(/maxExpand: 1000/g) || []).length, 2);
  assert.equal((source.match(/maxSize: 20/g) || []).length, 2);
  assert.match(source, /text\.length > 5000/);
  assert.match(source, /content\.length > 50000/);
});

test("public profile renders no DOB placeholder or date formatter", () => {
  const source = fs.readFileSync("src/app/profile/[username]/page.tsx", "utf8");
  assert.doesNotMatch(source, /formatDob|user\.dob|Cake/);
});

test("practice analysis releases its local submit lock after a rejected analysis", () => {
  const source = fs.readFileSync("src/components/topic/practice-analysis-section.tsx", "utf8");
  assert.match(source, /if \(isSubmitted && !isAnalyzing && !finalAnalysis\)\s*\{\s*setIsSubmitted\(false\);/);
});
