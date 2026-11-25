import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("written-practice report clamps invalid overall and authenticity scores", () => {
  const source = fs.readFileSync("src/components/topic/final-analysis-display.tsx", "utf8");
  assert.match(source, /Number\.isFinite\(rawOverallScore\)/);
  assert.match(source, /Number\.isFinite\(rawNaturalScore\)/);
  assert.match(source, /\{safeOverallScore\}\/100/);
  assert.match(source, /Number\.isFinite\(critique\.scoreOutOf10\)/);
});

test("stored AI chart series are finite, range-bounded, and length-bounded before rendering", () => {
  const source = fs.readFileSync("src/components/topic/final-analysis-display.tsx", "utf8");
  assert.match(source, /rawList\.slice\(0, 25\)/);
  assert.match(source, /chart\.data\.slice\(0, 30\)/);
  assert.match(source, /Number\.isFinite\(item\.score\)/);
  assert.match(source, /Number\.isFinite\(item\.value\)/);
  assert.match(source, /Math\.max\(0, Math\.min\(100, item\.score\)\)/);
});
