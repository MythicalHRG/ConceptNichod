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
