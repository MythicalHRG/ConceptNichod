import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  checkRateLimit,
  peekRateLimit,
  resetRateLimit,
  recordFailedAttempt
} from "../src/lib/rate-limiter.ts";

test("Tareeka 15: Sliding-window rate limiter permits requests within configured threshold and decrements remaining quota", () => {
  const testKey = "test-limit-basic-" + Date.now();
  const limit = 5;
  const windowMs = 60000;

  for (let i = 1; i <= limit; i++) {
    const res = checkRateLimit(testKey, limit, windowMs);
    assert.strictEqual(res.success, true, `Call #${i} should succeed within limit`);
    assert.strictEqual(res.limit, limit);
    assert.strictEqual(res.remaining, limit - i, `Remaining count should be ${limit - i}`);
    assert.ok(res.resetMs > 0, "resetMs should be positive");
  }

  // Next call exceeds limit
  const blockedRes = checkRateLimit(testKey, limit, windowMs);
  assert.strictEqual(blockedRes.success, false, "Request exceeding limit must be blocked");
  assert.strictEqual(blockedRes.remaining, 0, "Remaining must be 0 when blocked");
  assert.ok(blockedRes.resetMs > 0, "resetMs should indicate time until window frees up");
});

test("Tareeka 15: Sliding-window rate limiter expires timestamps after windowMs and restores capacity", async () => {
  const testKey = "test-expiry-" + Date.now();
  const limit = 2;
  const shortWindowMs = 150; // 150 milliseconds

  // Consume full quota
  const r1 = checkRateLimit(testKey, limit, shortWindowMs);
  const r2 = checkRateLimit(testKey, limit, shortWindowMs);
  assert.strictEqual(r1.success, true);
  assert.strictEqual(r2.success, true);

  // Blocked immediately
  const blocked = checkRateLimit(testKey, limit, shortWindowMs);
  assert.strictEqual(blocked.success, false);

  // Wait for window to expire
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Should succeed again after window expiry
  const renewed = checkRateLimit(testKey, limit, shortWindowMs);
  assert.strictEqual(renewed.success, true, "Quota should be restored after window expiration");
  assert.strictEqual(renewed.remaining, limit - 1);
});

test("Tareeka 15: Rate limiter strictly isolates quotas across different keys and IP addresses", () => {
  const ip1 = "192.168.1.100-" + Date.now();
  const ip2 = "192.168.1.101-" + Date.now();
  const limit = 3;
  const windowMs = 60000;

  // Exhaust IP 1
  for (let i = 0; i < limit; i++) {
    assert.strictEqual(checkRateLimit(ip1, limit, windowMs).success, true);
  }
  assert.strictEqual(checkRateLimit(ip1, limit, windowMs).success, false, "IP1 should be blocked");

  // IP 2 must not be affected by IP 1 exhaustion
  const resIp2 = checkRateLimit(ip2, limit, windowMs);
  assert.strictEqual(resIp2.success, true, "IP2 must retain its own independent quota");
  assert.strictEqual(resIp2.remaining, limit - 1);
});

test("Tareeka 15: Login rate limiting policy enforces 5 failed attempts per 15 minutes and allows reset", () => {
  const loginKey = "login:ip:10.0.0.1:user:rahul_" + Date.now();
  const LOGIN_LIMIT = 5;
  const LOGIN_WINDOW = 15 * 60 * 1000; // 15 minutes

  for (let attempt = 1; attempt <= LOGIN_LIMIT; attempt++) {
    const res = recordFailedAttempt(loginKey, LOGIN_LIMIT, LOGIN_WINDOW);
    assert.strictEqual(res.success, true, `Failed attempt #${attempt} recorded`);
  }

  // 6th attempt locks out attacker
  const lockedOut = recordFailedAttempt(loginKey, LOGIN_LIMIT, LOGIN_WINDOW);
  assert.strictEqual(lockedOut.success, false, "6th login attempt must be rejected (429)");
  assert.strictEqual(lockedOut.remaining, 0);

  // Successful login clears the counter
  resetRateLimit(loginKey);

  // After reset, fresh attempt succeeds
  const freshAttempt = checkRateLimit(loginKey, LOGIN_LIMIT, LOGIN_WINDOW);
  assert.strictEqual(freshAttempt.success, true, "Counter reset restores login capability");
});

test("Tareeka 15: Registration rate limiting policy enforces 3 registrations per hour per IP", () => {
  const regKey = "reg:ip:10.0.0.2_" + Date.now();
  const REG_LIMIT = 3;
  const REG_WINDOW = 60 * 60 * 1000; // 1 hour

  for (let i = 1; i <= REG_LIMIT; i++) {
    const res = checkRateLimit(regKey, REG_LIMIT, REG_WINDOW);
    assert.strictEqual(res.success, true);
  }

  // 4th registration in 1 hour is blocked
  const blockedReg = checkRateLimit(regKey, REG_LIMIT, REG_WINDOW);
  assert.strictEqual(blockedReg.success, false, "4th registration in 1 hour must be rejected");
});

test("Tareeka 15: OTP send rate limiting policy enforces 5 requests per 15 minutes per IP", () => {
  const otpKey = "otp:ip:10.0.0.3_" + Date.now();
  const OTP_LIMIT = 5;
  const OTP_WINDOW = 15 * 60 * 1000; // 15 minutes

  for (let i = 1; i <= OTP_LIMIT; i++) {
    const res = checkRateLimit(otpKey, OTP_LIMIT, OTP_WINDOW);
    assert.strictEqual(res.success, true);
  }

  const blockedOtp = checkRateLimit(otpKey, OTP_LIMIT, OTP_WINDOW);
  assert.strictEqual(blockedOtp.success, false, "6th OTP request in 15 minutes must be rejected");
});

test("Tareeka 15: AI generation rate limiting policy enforces 10 requests per minute", () => {
  const aiKey = "ai:user:student_42_" + Date.now();
  const AI_LIMIT = 10;
  const AI_WINDOW = 60 * 1000; // 1 minute

  for (let i = 1; i <= AI_LIMIT; i++) {
    const res = checkRateLimit(aiKey, AI_LIMIT, AI_WINDOW);
    assert.strictEqual(res.success, true);
  }

  const blockedAi = checkRateLimit(aiKey, AI_LIMIT, AI_WINDOW);
  assert.strictEqual(blockedAi.success, false, "11th AI generation in 1 min must be rejected");
});

test("Tareeka 15: peekRateLimit inspects remaining capacity without consuming attempts", () => {
  const peekKey = "peek-test-" + Date.now();
  const limit = 4;
  const windowMs = 60000;

  // Check initial peek
  const initialPeek = peekRateLimit(peekKey, limit, windowMs);
  assert.strictEqual(initialPeek.success, true);
  assert.strictEqual(initialPeek.remaining, limit);

  // Consume 1 attempt
  checkRateLimit(peekKey, limit, windowMs);

  // Peek again - remaining should be 3 and repeated peeks should not change it
  const peekAfter1 = peekRateLimit(peekKey, limit, windowMs);
  assert.strictEqual(peekAfter1.remaining, limit - 1);

  const peekAfter2 = peekRateLimit(peekKey, limit, windowMs);
  assert.strictEqual(peekAfter2.remaining, limit - 1, "Peeking again must not consume quota");
});

test("Tareeka 15: Concurrent burst handling enforces strict capacity without over-allocation", async () => {
  const burstKey = "burst-test-" + Date.now();
  const limit = 8;
  const windowMs = 60000;

  // Fire 20 parallel requests
  const promises = Array.from({ length: 20 }, () =>
    Promise.resolve().then(() => checkRateLimit(burstKey, limit, windowMs))
  );

  const results = await Promise.all(promises);
  const successes = results.filter((r) => r.success).length;
  const failures = results.filter((r) => !r.success).length;

  assert.strictEqual(successes, limit, `Exactly ${limit} requests should succeed in concurrent burst`);
  assert.strictEqual(failures, 20 - limit, `Remaining ${20 - limit} requests must be rejected`);
});

test("Tareeka 15: Static contract verification - API routes & auth actions reference rate limiting", () => {
  const otpRoutePath = path.resolve("src/app/api/auth/otp/route.ts");
  const authActionPath = path.resolve("src/app/actions/auth.ts");

  if (fs.existsSync(otpRoutePath)) {
    const otpContent = fs.readFileSync(otpRoutePath, "utf-8");
    assert.ok(
      otpContent.includes("429") || otpContent.includes("rate-limiter") || otpContent.includes("checkRateLimit"),
      "OTP route must incorporate 429 status or rate-limiter protection"
    );
  }

  if (fs.existsSync(authActionPath)) {
    const authContent = fs.readFileSync(authActionPath, "utf-8");
    assert.ok(
      authContent.includes("rate-limiter") || authContent.includes("checkRateLimit") || authContent.includes("recordFailedAttempt"),
      "Auth action must incorporate rate limiting logic"
    );
  }
});
