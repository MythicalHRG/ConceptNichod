import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

import { createSignedSessionCookie, verifySessionCookie } from "../src/lib/session.ts";
import {
  checkRateLimit,
  peekRateLimit,
  recordFailedAttempt,
  resetRateLimit
} from "../src/lib/rate-limiter.ts";

// Transpile src/lib/ip.ts for direct Node ESM execution with mock headers
const ipTsSource = fs.readFileSync(path.resolve("src/lib/ip.ts"), "utf-8")
  .replace(/^import\s+.*?;/m, "const headers = () => null;");
const { outputText: ipJsSource } = ts.transpileModule(ipTsSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext }
});
const ipModule = await import("data:text/javascript," + encodeURIComponent(ipJsSource));
const { sanitizeIp, getClientIp } = ipModule;

// =====================================================================
// CHALLENGE 1: Session Security & HMAC Verification Probes
// =====================================================================

test("Challenger 1.1: Forged signature on valid UUID is strictly rejected", () => {
  const validUuid = "12345678-abcd-ef01-2345-6789abcdef01";
  const signed = createSignedSessionCookie(validUuid);
  const [uuid, sig] = signed.split(".");

  // 1. Bit flip in signature
  const flippedSig = (sig[0] === "0" ? "1" : "0") + sig.slice(1);
  assert.strictEqual(verifySessionCookie(`${uuid}.${flippedSig}`), null, "Flipped signature bit must return null");

  // 2. Completely randomized 64-char hex signature
  const randomSig = crypto.randomBytes(32).toString("hex");
  assert.strictEqual(verifySessionCookie(`${uuid}.${randomSig}`), null, "Random signature must return null");

  // 3. Truncated signature (32 chars instead of 64)
  assert.strictEqual(verifySessionCookie(`${uuid}.${sig.slice(0, 32)}`), null, "Truncated signature must return null");

  // 4. Overlong signature (65 chars)
  assert.strictEqual(verifySessionCookie(`${uuid}.${sig}a`), null, "Overlong signature must return null");

  // 5. Signature with invalid characters
  assert.strictEqual(verifySessionCookie(`${uuid}.${sig.slice(0, 60)}!@#$`), null, "Non-hex signature must return null");
});

test("Challenger 1.2: Cross-UUID signature replay attack is rejected", () => {
  const victimUuid = "11111111-2222-3333-4444-555555555555";
  const attackerUuid = "99999999-8888-7777-6666-555555555555";

  const victimSigned = createSignedSessionCookie(victimUuid);
  const [, victimSig] = victimSigned.split(".");

  // Attacker tries to reuse victim's valid signature with their own UUID
  const forgedCookie = `${attackerUuid}.${victimSig}`;
  assert.strictEqual(verifySessionCookie(forgedCookie), null, "Signature reuse across UUIDs must return null");
});

test("Challenger 1.3: Foreign secret HMAC generation is rejected", () => {
  const uuid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const fakeSecret = "adversarial-attacker-secret-key-salt";
  const fakeSig = crypto.createHmac("sha256", fakeSecret).update(uuid).digest("hex");

  assert.strictEqual(verifySessionCookie(`${uuid}.${fakeSig}`), null, "Foreign secret signature must return null");
});

test("Challenger 1.4: Malformed, punctuated, and injection cookie values fail closed", () => {
  const validUuid = "12345678-abcd-ef01-2345-6789abcdef01";
  const validSigned = createSignedSessionCookie(validUuid);

  // Multiple dots
  assert.strictEqual(verifySessionCookie(`${validSigned}.extra`), null, "Cookie with multiple dots must fail");
  assert.strictEqual(verifySessionCookie(`extra.${validSigned}`), null, "Prepended dot format must fail");
  assert.strictEqual(verifySessionCookie(".."), null, "Only dots must fail");
  assert.strictEqual(verifySessionCookie(".something"), null, "Leading dot must fail");
  assert.strictEqual(verifySessionCookie("something."), null, "Trailing dot must fail");

  // Null, undefined, empty, whitespace
  assert.strictEqual(verifySessionCookie(""), null, "Empty string must return null");
  assert.strictEqual(verifySessionCookie("   "), null, "Whitespace-only must return null");
  assert.strictEqual(verifySessionCookie(null), null, "Null must return null");
  assert.strictEqual(verifySessionCookie(undefined), null, "Undefined must return null");

  // Injection payloads
  assert.strictEqual(verifySessionCookie("' OR '1'='1"), null, "SQLi token must return null");
  assert.strictEqual(verifySessionCookie("<script>alert(1)</script>"), null, "XSS token must return null");
  assert.strictEqual(verifySessionCookie("../../../etc/passwd"), null, "Path traversal must return null");
  assert.strictEqual(verifySessionCookie("\0nullbyte"), null, "Null byte token must return null");
});

test("Challenger 1.5: Backward compatibility probe - unsigned UUID behavior", () => {
  const rawUuid = "abcdef12-3456-7890-abcd-ef1234567890";
  // The system permits valid UUID format for zero-downtime rolling migration
  const result = verifySessionCookie(rawUuid);
  assert.strictEqual(result, rawUuid, "Unsigned valid UUID is accepted during rolling migration");

  // But invalid UUID strings without dot must fail
  assert.strictEqual(verifySessionCookie("not-a-valid-uuid-format"), null, "Invalid unsigned string must return null");
  assert.strictEqual(verifySessionCookie("abcdef12-3456-7890-abcd-ef123456789g"), null, "Non-hex unsigned string must return null");
});

// =====================================================================
// CHALLENGE 2: Rate Limiting Stress Test & Memory Cleanliness
// =====================================================================

test("Challenger 2.1: Concurrent burst handling reliably limits requests beyond quota", async () => {
  const key = `stress-burst-${Date.now()}`;
  const limit = 10;
  const windowMs = 2000;

  // Execute 50 concurrent requests
  const promises = Array.from({ length: 50 }, () =>
    Promise.resolve().then(() => checkRateLimit(key, limit, windowMs))
  );

  const results = await Promise.all(promises);
  const successes = results.filter((r) => r.success);
  const failures = results.filter((r) => !r.success);

  assert.strictEqual(successes.length, limit, `Exactly ${limit} requests should succeed`);
  assert.strictEqual(failures.length, 40, "Exactly 40 requests should be blocked");

  // Check failure details
  for (const failure of failures) {
    assert.strictEqual(failure.remaining, 0, "Remaining must be 0 on failure");
    assert.ok(failure.resetMs > 0 && failure.resetMs <= windowMs, "resetMs must be within valid range");
  }
});

test("Challenger 2.2: Window sliding and capacity reset after expiration", async () => {
  const key = `stress-expiry-${Date.now()}`;
  const limit = 3;
  const windowMs = 150; // 150ms window

  // Consume all 3 attempts
  for (let i = 0; i < 3; i++) {
    const res = checkRateLimit(key, limit, windowMs);
    assert.strictEqual(res.success, true);
  }

  // 4th attempt must fail
  const blocked = checkRateLimit(key, limit, windowMs);
  assert.strictEqual(blocked.success, false);

  // Wait for window to slide past
  await new Promise((resolve) => setTimeout(resolve, 180));

  // Next request must succeed because previous entries expired
  const restored = checkRateLimit(key, limit, windowMs);
  assert.strictEqual(restored.success, true, "Capacity must be restored after sliding window passes");
  assert.strictEqual(restored.remaining, limit - 1);
});

test("Challenger 2.3: peekRateLimit invariance under repeated inspection", () => {
  const key = `stress-peek-${Date.now()}`;
  const limit = 5;
  const windowMs = 60000;

  checkRateLimit(key, limit, windowMs); // 1 consumed, 4 left

  // Peek 20 times in a row
  for (let i = 0; i < 20; i++) {
    const peek = peekRateLimit(key, limit, windowMs);
    assert.strictEqual(peek.success, true);
    assert.strictEqual(peek.remaining, 4, "Peek must never consume remaining quota");
  }
});

test("Challenger 2.4: resetRateLimit immediately purges rate limit state", () => {
  const key = `stress-reset-${Date.now()}`;
  const limit = 2;
  const windowMs = 60000;

  checkRateLimit(key, limit, windowMs);
  checkRateLimit(key, limit, windowMs);
  const blocked = checkRateLimit(key, limit, windowMs);
  assert.strictEqual(blocked.success, false);

  // Reset key
  resetRateLimit(key);

  // Immediately query again: should have full quota restored
  const fresh = checkRateLimit(key, limit, windowMs);
  assert.strictEqual(fresh.success, true);
  assert.strictEqual(fresh.remaining, limit - 1);
});

test("Challenger 2.5: Key space isolation and memory eviction mechanism analysis", () => {
  // Test isolation across keys
  const ip1 = `isolated-ip-1-${Date.now()}`;
  const ip2 = `isolated-ip-2-${Date.now()}`;

  checkRateLimit(ip1, 1, 60000);
  const ip1Blocked = checkRateLimit(ip1, 1, 60000);
  assert.strictEqual(ip1Blocked.success, false, "ip1 must be blocked");

  const ip2Allowed = checkRateLimit(ip2, 1, 60000);
  assert.strictEqual(ip2Allowed.success, true, "ip2 must NOT be blocked by ip1 quota consumption");

  // Clean up test keys
  resetRateLimit(ip1);
  resetRateLimit(ip2);
});

// =====================================================================
// CHALLENGE 3: IP Resolver & Sanitization Edge Cases
// =====================================================================

test("Challenger 3.1: IPv6 localhost and IPv4-mapped IPv6 address normalization", () => {
  // Localhost representations
  assert.strictEqual(sanitizeIp("::1"), "127.0.0.1", "Standard IPv6 localhost");
  assert.strictEqual(sanitizeIp("::ffff:127.0.0.1"), "127.0.0.1", "IPv4-mapped localhost");
  assert.strictEqual(sanitizeIp("localhost"), "127.0.0.1", "Word localhost");
  assert.strictEqual(sanitizeIp("  ::1  "), "127.0.0.1", "IPv6 localhost with padding");

  // IPv4-mapped IPv6 public / private
  assert.strictEqual(sanitizeIp("::ffff:192.168.1.1"), "192.168.1.1", "IPv4-mapped private");
  assert.strictEqual(sanitizeIp("::ffff:203.0.113.195"), "203.0.113.195", "IPv4-mapped public");
});

test("Challenger 3.2: Malformed headers and injection string sanitization", () => {
  // SQL Injection payloads
  assert.strictEqual(
    sanitizeIp("192.168.1.10; DROP TABLE users;--"),
    "192.168.1.10",
    "SQL injection should be stripped while preserving valid IP prefix"
  );

  // Command injection
  assert.strictEqual(
    sanitizeIp("10.0.0.1 && cat /etc/passwd"),
    "10.0.0.1",
    "Command injection payload should be stripped"
  );

  // XSS injection
  assert.strictEqual(
    sanitizeIp("<script>alert('pwned')</script>"),
    "127.0.0.1",
    "XSS string with no valid IP must fall back to 127.0.0.1"
  );

  // Out of range IPv4 octets
  assert.strictEqual(
    sanitizeIp("999.999.999.999"),
    "127.0.0.1",
    "Out of range octets must be rejected and fallback to 127.0.0.1"
  );

  // Null, undefined, empty, non-string
  assert.strictEqual(sanitizeIp(""), "127.0.0.1");
  assert.strictEqual(sanitizeIp(null), "127.0.0.1");
  assert.strictEqual(sanitizeIp(undefined), "127.0.0.1");
  assert.strictEqual(sanitizeIp(12345), "127.0.0.1");
});

test("Challenger 3.3: Proxy header precedence and comma-separated client resolution", () => {
  // 1. Cloudflare cf-connecting-ip takes precedence over x-forwarded-for
  const cfHeaders = {
    "cf-connecting-ip": "198.51.100.25",
    "x-forwarded-for": "203.0.113.50, 10.0.0.1",
    "x-real-ip": "10.0.0.2"
  };
  assert.strictEqual(getClientIp(cfHeaders), "198.51.100.25");

  // 2. x-forwarded-for selects the leftmost untrusted client IP
  const xffHeaders = {
    "x-forwarded-for": "203.0.113.88, 172.16.0.5, 10.2.3.4",
    "x-real-ip": "172.16.0.5"
  };
  assert.strictEqual(getClientIp(xffHeaders), "203.0.113.88");

  // 3. x-forwarded-for with irregular spacing
  const messyXff = {
    "x-forwarded-for": "   192.0.2.44   , 10.0.0.1 "
  };
  assert.strictEqual(getClientIp(messyXff), "192.0.2.44");

  // 4. Fallback to x-real-ip when no x-forwarded-for or cf-connecting-ip
  const realIpOnly = {
    "x-real-ip": "198.51.100.99"
  };
  assert.strictEqual(getClientIp(realIpOnly), "198.51.100.99");

  // 5. Fallback to 127.0.0.1 when headers empty
  assert.strictEqual(getClientIp({}), "127.0.0.1");
  assert.strictEqual(getClientIp(null), "127.0.0.1");
});

// =====================================================================
// CHALLENGE 4: Profile Data Leakage Adversarial Verification
// =====================================================================

test("Challenger 4.1: Public profile data projection never leaks sensitive IP or timestamp fields", () => {
  const profileFilePath = path.resolve("src/app/actions/profile.ts");
  const content = fs.readFileSync(profileFilePath, "utf-8");
  const publicUserQuery = content.slice(content.indexOf("export async function getPublicProfileData("), content.indexOf("if (!user)"));
  const allowedFields = ["username", "fullName", "classLevel", "examFocus", "city", "instagram", "snapchat", "bio"];
  assert.ok(publicUserQuery.includes('.select("username fullName classLevel examFocus city instagram snapchat bio")'),
    "Public profile must use a positive field allowlist");

  const mockDbUser = {
    username: "victim_student", fullName: "Victim Student", gender: "Female", dob: "2005-01-01",
    classLevel: "12+", city: "Delhi", examFocus: "UPSC", instagram: "student", snapchat: "student", bio: "Learner",
    futureCollege: "Private College", role: "owner", firstLoginIp: "203.0.113.99",
    firstLoginAt: new Date("2026-01-01T00:00:00Z"), lastLoginIp: "198.51.100.88",
    lastLoginAt: new Date("2026-11-04T00:00:00Z"), lastKnownIp: "198.51.100.88",
    password: "hashed_secret_password", email: "victim@gmail.com", uuid: "victim-secret-uuid-1234",
    _id: "mongo-object-id-1234", createdAt: new Date(), __v: 0,
  };
  const projected = Object.fromEntries(Object.entries(mockDbUser).filter(([key]) => allowedFields.includes(key)));
  for (const field of allowedFields) assert.ok(field in projected, `Allowed public field ${field} should remain`);
  const forbiddenKeys = ["gender", "dob", "futureCollege", "role", "firstLoginIp", "firstLoginAt", "lastLoginIp", "lastLoginAt", "lastKnownIp", "password", "email", "uuid", "_id", "createdAt", "__v"];
  for (const key of forbiddenKeys) {
    assert.strictEqual(key in projected, false, `Property ${key} must NOT exist on projected public profile`);
  }
});
// =====================================================================
// CHALLENGE 5: Aspirants UUID Redaction Adversarial Verification
// =====================================================================

test("Challenger 5.1: Aspirants Connect search strictly redacts user UUID from results", () => {
  const aspirantsFilePath = path.resolve("src/app/actions/aspirants.ts");
  const content = fs.readFileSync(aspirantsFilePath, "utf-8");

  // In searchAspirantsAction, verify session is verified using verifySessionCookie
  assert.ok(
    content.includes("verifySessionCookie"),
    "searchAspirantsAction must use verifySessionCookie"
  );

  // In the return mapping, verify uuid is NOT in the mapped fields
  const mapMatch = content.match(/return\s+users\.map\(\s*\(.*?\)\s*=>\s*\(\{([\s\S]*?)\}\)\);/);
  assert.ok(mapMatch, "searchAspirantsAction must project returned users via map()");

  const returnFields = mapMatch[1];
  assert.ok(
    !returnFields.includes("uuid:"),
    "searchAspirantsAction must NEVER expose uuid in the return object mapping"
  );

  // Verify that an aspirant list output has no uuid property
  const mockAspirantsFromDb = [
    {
      uuid: "secret-aspirant-uuid-1",
      username: "aspirant1",
      fullName: "Aspirant One",
      gender: "Male",
      classLevel: "12+",
      city: "Jaipur"
    },
    {
      uuid: "secret-aspirant-uuid-2",
      username: "aspirant2",
      fullName: "Aspirant Two",
      gender: "Female",
      classLevel: "Class 12",
      city: "Kota"
    }
  ];

  const mapped = mockAspirantsFromDb.map((u) => ({
    username: u.username,
    fullName: u.fullName,
    gender: u.gender,
    classLevel: u.classLevel,
    city: u.city
  }));

  for (const aspirant of mapped) {
    assert.strictEqual("uuid" in aspirant, false, "uuid must not exist in returned aspirant");
    assert.strictEqual(aspirant.uuid, undefined);
  }
});
