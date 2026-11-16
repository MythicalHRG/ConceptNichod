import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("production handlers use the shared MongoDB rate limiter", () => {
  const paths = [
    "src/app/api/auth/otp/route.ts",
    "src/app/actions/study-groups.ts",
    "src/app/actions/mistakes.ts",
    "src/app/actions/feedback.ts",
    "src/app/api/generate/content/route.ts",
    "src/app/api/generate/analysis/route.ts",
    "src/app/actions/followup.ts",
    "src/ai/flows/analyze-concept-explanation.ts",
    "src/app/actions/auth.ts",
  ];
  for (const path of paths) {
    const source = fs.readFileSync(path, "utf8");
    assert.match(source, /checkDistributedRateLimit|peekDistributedRateLimit/,
      path + " must use shared storage for production rate limits");
    assert.doesNotMatch(source, /(?<!Distributed)checkRateLimit\(/,
      path + " must not use process-local rate limits");
  }
});

test("shared rate-limit model defines unique window keys and TTL cleanup", () => {
  const source = fs.readFileSync("src/models/RateLimitCounter.ts", "utf8");
  assert.match(source, /key:\s*1,\s*windowStart:\s*1/);
  assert.match(source, /unique:\s*true/);
  assert.match(source, /expiresAt:\s*1/);
  assert.match(source, /expireAfterSeconds:\s*0/);
});

test("OTP fallback rate limits scope missing proxy IPs by email", () => {
  const otp = fs.readFileSync("src/app/api/auth/otp/route.ts", "utf8");
  assert.match(otp, /otp:verify:ip:\$\{ip\}:\$\{email\}/);
  assert.match(otp, /otp:verify:email:\$\{email\}/);
  assert.match(otp, /ipUnavailable = ip === "127\.0\.0\.1" \|\| ip === "unknown"/);
});
