import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("public profile analytics excludes non-finite stored Topic and ConceptMirror values", () => {
  const source = fs.readFileSync("src/app/actions/profile.ts", "utf8");
  assert.match(source, /Number\.isFinite\(t\.analysis\.overallScore\)/);
  assert.match(source, /Number\.isFinite\(d\.score\)/);
  assert.match(source, /validMirrorDocs = mirrorDocs\.filter/);
  assert.match(source, /Number\.isFinite\(doc\.overallScore\)/);
  assert.match(source, /Number\.isFinite\(r\.score\)/);
  assert.match(source, /Number\.isFinite\(doc\.durationSeconds\)/);
});

test("leaderboard filters invalid scores, durations, dates, and streak values before aggregation", () => {
  const source = fs.readFileSync("src/app/actions/leaderboard.ts", "utf8");
  assert.match(source, /Number\.isFinite\(rawScore\)/);
  assert.match(source, /Number\.isFinite\(createdAt\.getTime\(\)\)/);
  assert.match(source, /Number\.isFinite\(rawDuration\)/);
  assert.match(source, /Number\.isFinite\(topic\.analysis\.overallScore\)/);
  assert.match(source, /Number\.isFinite\(currentStreakValue\)/);
  assert.match(source, /Number\.isFinite\(longestStreakValue\)/);
});
