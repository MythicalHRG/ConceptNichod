import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("public profile analytics excludes non-finite stored Topic and ConceptMirror values", () => {
  const source = fs.readFileSync("src/app/actions/profile.ts", "utf8");
  assert.match(source, /Number\.isFinite\(t\.analysis\.overallScore\)/);
  assert.match(source, /Number\.isFinite\(d\.score\)/);
  assert.match(source, /\.cursor\(\{ batchSize: 250 \}\)/);
  assert.match(source, /Number\.isFinite\(doc\.overallScore\)/);
  assert.match(source, /Number\.isFinite\(r\.score\)/);
  assert.match(source, /Number\.isFinite\(doc\.durationSeconds\)/);
});

test("leaderboard filters invalid scores, durations, dates, and streak values before aggregation", () => {
  const source = fs.readFileSync("src/app/actions/leaderboard.ts", "utf8");
  assert.match(source, /Number\.isFinite\(rawScore\)/);
  assert.match(source, /Number\.isFinite\(createdAt\.getTime\(\)\)/);
  assert.match(source, /Number\.isFinite\(rawDuration\)/);
  assert.match(source, /Number\.isFinite\(event\.analysisScore\)/);
  assert.match(source, /\$unionWith/);
  assert.match(source, /summary\.trajectory\.length > 100/);
  assert.match(source, /Number\.isFinite\(currentStreakValue\)/);
  assert.match(source, /Number\.isFinite\(longestStreakValue\)/);
});
