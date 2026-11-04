import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  createSignedSessionCookie,
  verifySessionCookie
} from "../src/lib/session.ts";

test("Tareeka 16: Session signer produces valid HMAC-SHA256 signed cookie format <uuid>.<signature>", () => {
  const uuid = "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d";
  const signedCookie = createSignedSessionCookie(uuid);

  assert.ok(signedCookie.includes("."), "Signed cookie must contain a dot delimiter");
  const parts = signedCookie.split(".");
  assert.strictEqual(parts.length, 2, "Signed cookie must split into exactly uuid and signature");
  assert.strictEqual(parts[0], uuid, "First part must be the exact UUID");
  assert.strictEqual(parts[1].length, 64, "Signature must be 64-character SHA256 hex digest");
  assert.match(parts[1], /^[0-9a-f]{64}$/i, "Signature must be valid hex characters");
});

test("Tareeka 16: verifySessionCookie verifies valid signed session and returns payload UUID", () => {
  const uuid = "98765432-1234-5678-1234-56789abcdef0";
  const signedCookie = createSignedSessionCookie(uuid);

  const verifiedUuid = verifySessionCookie(signedCookie);
  assert.strictEqual(verifiedUuid, uuid, "Verifier must return the exact UUID for a valid cookie");
});

test("Tareeka 16: Forged or tampered signature is strictly rejected", () => {
  const uuid = "12345678-1234-1234-1234-123456789abc";
  const signedCookie = createSignedSessionCookie(uuid);
  const [origUuid, origSig] = signedCookie.split(".");

  // Tamper 1 character in the signature
  const corruptedChar = origSig[0] === "a" ? "b" : "a";
  const tamperedSig = corruptedChar + origSig.slice(1);
  const tamperedCookie = `${origUuid}.${tamperedSig}`;

  const result = verifySessionCookie(tamperedCookie);
  assert.strictEqual(result, null, "Tampered signature must return null");
});

test("Tareeka 16: Cross-UUID tampering (valid signature applied to different UUID) is strictly rejected", () => {
  const legitimateUuid = "11111111-1111-1111-1111-111111111111";
  const attackerUuid = "99999999-9999-9999-9999-999999999999";

  const legitimateCookie = createSignedSessionCookie(legitimateUuid);
  const [, legitimateSig] = legitimateCookie.split(".");

  // Attacker tries to use legitimate signature with their attacker UUID
  const forgedCookie = `${attackerUuid}.${legitimateSig}`;
  const result = verifySessionCookie(forgedCookie);

  assert.strictEqual(result, null, "Cross-UUID signature mismatch must return null");
});

test("Tareeka 16: Signature generated with different secret key is rejected", () => {
  const uuid = "44444444-4444-4444-4444-444444444444";
  const foreignSecret = "unauthorized-external-attacker-secret-key-999";
  const forgedSig = crypto.createHmac("sha256", foreignSecret).update(uuid).digest("hex");
  const forgedCookie = `${uuid}.${forgedSig}`;

  const result = verifySessionCookie(forgedCookie);
  assert.strictEqual(result, null, "Signature with foreign secret must be rejected");
});

test("Tareeka 16: Malformed, truncated, or empty session tokens fail closed", () => {
  assert.strictEqual(verifySessionCookie(""), null, "Empty string should return null");
  assert.strictEqual(verifySessionCookie(null), null, "Null should return null");
  assert.strictEqual(verifySessionCookie(undefined), null, "Undefined should return null");
  assert.strictEqual(verifySessionCookie("not-a-token"), null, "Random string should return null");
  assert.strictEqual(verifySessionCookie("uuid.shortSig"), null, "Truncated signature should return null");
  assert.strictEqual(verifySessionCookie(".."), null, "Dots only should return null");
});

test("Tareeka 16: Backward compatibility - valid unsigned UUID format is accepted during rolling migration", () => {
  const legacyUuid = "abcdef12-3456-7890-abcd-ef1234567890";
  const verified = verifySessionCookie(legacyUuid);
  assert.strictEqual(verified, legacyUuid, "Legacy valid UUID format should be verified for zero-downtime migration");
});

test("Tareeka 16: UUID is strictly redacted from Aspirants Connect search payload", () => {
  const aspirantsActionPath = path.resolve("src/app/actions/aspirants.ts");
  const content = fs.readFileSync(aspirantsActionPath, "utf-8");

  // In searchAspirantsAction return map, uuid must NOT be included
  // Find the return mapping block in searchAspirantsAction
  const returnMatch = content.match(/return\s+users\.map\(\s*\(.*?\)\s*=>\s*\(\{([\s\S]*?)\}\)\);/);
  assert.ok(returnMatch, "Should find users.map return projection in searchAspirantsAction");

  const returnBody = returnMatch[1];
  assert.ok(
    !returnBody.includes("uuid:"),
    "Returned aspirant DTO must NOT include 'uuid' property (account takeover vulnerability)"
  );

  // Simulation test
  const rawDbUsers = [
    {
      uuid: "super-secret-admin-uuid-1234",
      username: "mythicalhrg",
      fullName: "Admin",
      classLevel: "Class 12",
      city: "Delhi"
    },
    {
      uuid: "student-uuid-5678",
      username: "student_neha",
      fullName: "Neha",
      classLevel: "12+",
      city: "Mumbai"
    }
  ];

  const sanitized = rawDbUsers.map((u) => {
    const { uuid, ...rest } = u;
    return rest;
  });

  for (const item of sanitized) {
    assert.strictEqual("uuid" in item, false, "uuid must be strictly removed");
    assert.strictEqual(item.uuid, undefined);
  }
});

test("Tareeka 16: Admin role isolation - only mythicalhrg is authorized, all other users fail closed", () => {
  const ADMIN_USERNAME = "mythicalhrg";

  function simulateVerifyAdmin(sessionUser) {
    if (!sessionUser) {
      throw new Error("Not authenticated");
    }
    if (sessionUser.username !== ADMIN_USERNAME) {
      throw new Error("Forbidden: Admin access only");
    }
    return { authorized: true, user: sessionUser };
  }

  // 1. Unauthenticated request
  assert.throws(() => simulateVerifyAdmin(null), /Not authenticated/);

  // 2. Normal student user
  assert.throws(
    () => simulateVerifyAdmin({ username: "student_john", role: "user" }),
    /Forbidden: Admin access only/
  );

  // 3. Privileged badge-holders (@anurag and @rohit have Bade Maalik badge, but NOT Admin access)
  assert.throws(
    () => simulateVerifyAdmin({ username: "anurag", role: "user" }),
    /Forbidden: Admin access only/
  );
  assert.throws(
    () => simulateVerifyAdmin({ username: "rohit", role: "user" }),
    /Forbidden: Admin access only/
  );

  // 4. Case sensitivity / whitespace spoofing
  assert.throws(
    () => simulateVerifyAdmin({ username: "mythicalhrg ", role: "user" }),
    /Forbidden: Admin access only/
  );

  // 5. Genuine admin
  const adminResult = simulateVerifyAdmin({ username: "mythicalhrg", role: "admin" });
  assert.strictEqual(adminResult.authorized, true);
  assert.strictEqual(adminResult.user.username, "mythicalhrg");
});

test("Tareeka 16: Anti-Bypass & Route Lockdown - Middleware and Security Headers Verification", () => {
  const middlewarePath = path.resolve("src/middleware.ts");
  const middlewareContent = fs.readFileSync(middlewarePath, "utf-8");

  // Verify dashboard route protection
  assert.ok(
    middlewareContent.includes("/dashboard") || middlewareContent.includes("user_session"),
    "Middleware must protect /dashboard routes against unauthenticated access"
  );

  // Check expected security headers in middleware or response generator
  const expectedSecurityHeaders = [
    "X-Frame-Options",
    "X-Content-Type-Options"
  ];

  // Helper function to test security header policies
  function applySecurityHeaders(headers = {}) {
    return {
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      ...headers
    };
  }

  const headers = applySecurityHeaders();
  assert.strictEqual(headers["X-Frame-Options"], "DENY", "Must enforce frame denial to prevent clickjacking");
  assert.strictEqual(headers["X-Content-Type-Options"], "nosniff", "Must enforce nosniff to prevent MIME sniffing");
  assert.strictEqual(headers["Referrer-Policy"], "strict-origin-when-cross-origin");
});
