import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("speech recognition reconnects with bounded exponential retries", () => {
  const source = fs.readFileSync("src/hooks/use-audio-recorder.ts", "utf8");
  assert.match(source, /restartCountRef\.current > 5/);
  assert.match(source, /Math\.min\(250 \* \(2 \*\* \(restartCountRef\.current - 1\)\), 4000\)/);
  assert.match(source, /retryTimeoutRef\.current = setTimeout/);
  assert.match(source, /clearTimeout\(retryTimeoutRef\.current\)/);
  assert.match(source, /recognition initialization failed/);
  assert.match(source, /Speech recognition could not reconnect/);
});

test("generation HTTP routes cap input lengths and array sizes before AI execution", () => {
  const analysis = fs.readFileSync("src/app/api/generate/analysis/route.ts", "utf8");
  assert.match(analysis, /question: z\.string\(\)\.max\(500\)/);
  assert.match(analysis, /answer: z\.string\(\)\.max\(5000\)/);
  assert.match(analysis, /summary: z\.string\(\)\.min\(1, .summary is required.\)\.max\(8000\)/);
  assert.match(analysis, /writtenAnswers: z\.array\(AnswerSchema\)\.max\(10\)/);
  assert.match(analysis, /spokenAnswers: z\.array\(AnswerSchema\)\.max\(11\)/);
  const content = fs.readFileSync("src/app/api/generate/content/route.ts", "utf8");
  assert.match(content, /topicName: z\.string\(\)\.min\(1, .topicName is required.\)\.max\(200\)/);
});

test("UPI submission action is protected against duplicate reference creation at the database boundary", () => {
  const source = fs.readFileSync("src/app/actions/donation.ts", "utf8");
  const start = source.indexOf("export async function submitDonationTransaction(");
  const end = source.indexOf("\nexport async function getAdminDonationDashboard(", start);
  const action = source.slice(start, end);
  assert.match(action, /findOne\(\{[\s\S]*?\$or: \[\{ utr \}, \{ transactionId \}\]/);
  assert.match(action, /error\?\.code === 11000/);
  assert.match(action, /checkDistributedRateLimit/);
});

test("microphone startup is silent and speech-recognition failures are classified", () => {
  const source = fs.readFileSync("src/hooks/use-audio-recorder.ts", "utf8");
  assert.doesNotMatch(source, /playMicReadyChime|sharedChimeCtx|AudioContext/);
  for (const code of ["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"]) {
    assert.ok(source.includes(`"${code}"`), `Missing speech error handling: ${code}`);
  }
  assert.match(source, /restartCountRef\.current > 5/);
  assert.match(source, /setIsRecording\(true\);[\s\S]*?setIsConnecting\(true\);[\s\S]*?retryTimeoutRef\.current = setTimeout/);
});

test("AI analysis cannot permanently lock Concept Mirror recording after a failed request", () => {
  const source = fs.readFileSync("src/components/concept-mirror/mastery-dashboard.tsx", "utf8");
  assert.doesNotMatch(source, /lockAndAbort\(/);
  assert.match(source, /if \(isRecording \|\| isConnecting\)/);
  assert.match(source, /stopRecording\(\);[\s\S]*?setIsTopicLocked\(true\)/);
});

test("structured OpenRouter output is validated before a provider response is accepted", () => {
  const source = fs.readFileSync("src/lib/openrouter.ts", "utf8");
  assert.match(source, /if \(jsonMode\)[\s\S]*?parseJsonResponse<unknown>\(content\)/);
  assert.match(source, /malformed JSON[\s\S]*?continue/);
});

test("Concept Mirror report charts do not fabricate missing scores", () => {
  const flow = fs.readFileSync("src/ai/flows/analyze-concept-explanation.ts", "utf8");
  const ui = fs.readFileSync("src/components/concept-mirror/mastery-dashboard.tsx", "utf8");
  assert.doesNotMatch(flow, /overallScore \* 1\.04|overallScore \* 0\.92|Initial Recall.*score:/);
  assert.doesNotMatch(ui, /Definitions", score: 82|Initial Recall", score: 65|fallbackBase \|\| axis\.score/);
  assert.match(ui, /A single explanation cannot form a learning curve/);\n  assert.match(ui, /const safePolyData: \{ step: string; score: number \}\[\] = \[\]/);
});
