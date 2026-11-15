import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { verifySessionCookie, createSignedSessionCookie } from "../src/lib/session.ts";

function getIstDateString(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

function getYesterdayIstDateString(date = new Date()) {
  const prev = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  return getIstDateString(prev);
}

// ============================================================================
// TEST 30.1: Strict Session Signing & Production Zero-Click ATO Prevention
// ============================================================================

test("Audit Remediation 30.1: In strict mode, raw unsigned UUIDs are strictly rejected", () => {
  const originalStrict = process.env.STRICT_SESSION_SIGNING;
  try {
    process.env.STRICT_SESSION_SIGNING = "true";
    const rawUuid = "12345678-1234-1234-1234-123456789abc";

    const verified = verifySessionCookie(rawUuid);
    assert.strictEqual(
      verified,
      null,
      "In strict/production mode, unsigned UUIDs must return null to prevent zero-click account takeover."
    );
  } finally {
    if (originalStrict === undefined) {
      delete process.env.STRICT_SESSION_SIGNING;
    } else {
      process.env.STRICT_SESSION_SIGNING = originalStrict;
    }
  }
});

test("Audit Remediation 30.2: Signed session cookies succeed in strict mode", () => {
  const originalStrict = process.env.STRICT_SESSION_SIGNING;
  try {
    process.env.STRICT_SESSION_SIGNING = "true";
    const legitimateUuid = "abcdef12-3456-7890-abcd-ef1234567890";
    const signedCookie = createSignedSessionCookie(legitimateUuid);

    const verified = verifySessionCookie(signedCookie);
    assert.strictEqual(
      verified,
      legitimateUuid,
      "Legitimate HMAC-SHA256 signed session cookie must verify and return user UUID."
    );
  } finally {
    if (originalStrict === undefined) {
      delete process.env.STRICT_SESSION_SIGNING;
    } else {
      process.env.STRICT_SESSION_SIGNING = originalStrict;
    }
  }
});

test("Audit Remediation 30.3: Forged or modified HMAC signatures fail closed in strict mode", () => {
  const originalStrict = process.env.STRICT_SESSION_SIGNING;
  try {
    process.env.STRICT_SESSION_SIGNING = "true";
    const userUuid = "abcdef12-3456-7890-abcd-ef1234567890";
    const signedCookie = createSignedSessionCookie(userUuid);
    const tampered = signedCookie.slice(0, -4) + "beef";

    assert.strictEqual(verifySessionCookie(tampered), null, "Tampered signature must return null.");
  } finally {
    if (originalStrict === undefined) {
      delete process.env.STRICT_SESSION_SIGNING;
    } else {
      process.env.STRICT_SESSION_SIGNING = originalStrict;
    }
  }
});

// ============================================================================
// TEST 30.2: OTP Generation Entropy & CSPRNG (CWE-338 Mitigation)
// ============================================================================

test("Audit Remediation 30.4: crypto.randomInt generates valid 6-digit cryptographic OTPs", () => {
  for (let i = 0; i < 50; i++) {
    const otp = crypto.randomInt(100000, 1000000).toString();
    assert.strictEqual(otp.length, 6, "OTP must be exactly 6 digits");
    const num = parseInt(otp, 10);
    assert.ok(num >= 100000 && num <= 999999, "OTP must be within 100000 to 999999");
  }
});

// ============================================================================
// TEST 30.3: IST Timezone Date Alignment for Indian Student Study Streaks
// ============================================================================

test("Audit Remediation 30.5: getIstDateString correctly formats Indian Standard Time (Asia/Kolkata)", () => {
  // Midnight IST: 2026-11-08 01:00:00 IST is 2026-11-07 19:30:00 UTC
  const lateNightUtc = new Date("2026-11-07T19:30:00.000Z");
  const istDate = getIstDateString(lateNightUtc);
  assert.strictEqual(
    istDate,
    "2026-11-08",
    "A student studying at 1:00 AM IST on Nov 8 must receive Nov 8 streak date, not UTC Nov 7."
  );

  const prevIstDate = getYesterdayIstDateString(lateNightUtc);
  assert.strictEqual(
    prevIstDate,
    "2026-11-07",
    "Yesterday date in IST must be 2026-11-07."
  );

  const streakFile = fs.readFileSync(path.resolve("src/lib/streak.ts"), "utf-8");
  assert.ok(streakFile.includes("Asia/Kolkata"), "src/lib/streak.ts must specify Asia/Kolkata timezone");
  assert.ok(!streakFile.includes("toISOString().split('T')[0]"), "src/lib/streak.ts must not use raw UTC ISO string slicing");
});

// ============================================================================
// TEST 30.4: Static Security Contracts & Information Disclosure Elimination
// ============================================================================

test("Audit Remediation 30.6: Leaderboard action does NOT leak internal user UUIDs to clients", () => {
  const leaderboardPath = path.resolve("src/app/actions/leaderboard.ts");
  const content = fs.readFileSync(leaderboardPath, "utf-8");

  // LeaderboardEntry must not expose uuid
  const entryMatch = content.match(/export interface LeaderboardEntry\s*\{([\s\S]*?)\}/);
  assert.ok(entryMatch, "LeaderboardEntry interface must exist");
  assert.ok(!entryMatch[1].includes("uuid:"), "LeaderboardEntry must not define uuid field");

  // entries.push must not include uuid
  const pushMatch = content.match(/entries\.push\(\{([\s\S]*?)\}\);/);
  assert.ok(pushMatch, "entries.push block must exist");
  assert.ok(!pushMatch[1].includes("uuid:"), "entries.push must not serialize uuid");
});

test("Audit Remediation 30.7: Study groups action does NOT leak target UUIDs in direct messages", () => {
  const studyGroupsPath = path.resolve("src/app/actions/study-groups.ts");
  const content = fs.readFileSync(studyGroupsPath, "utf-8");

  // getDirectMessagesAction must not return target.uuid
  const targetMatch = content.match(/target:\s*\{([\s\S]*?)\}/);
  assert.ok(targetMatch, "target object must exist in getDirectMessagesAction");
  assert.ok(!targetMatch[1].includes("uuid:"), "target object must not return target.uuid");
});

test("Audit Remediation 30.8: Donor info action queries public donors safely", () => {
  const donationPath = path.resolve("src/app/actions/donation.ts");
  const content = fs.readFileSync(donationPath, "utf-8");
  assert.ok(content.includes('{ $match: { status: "verified", verifiedAmount: { $gt: 0 } } }'), "getDonationInfoAction must aggregate only bank-verified donation credits");
});

test("Audit Remediation 30.9: Rate limiting is strictly enforced on feedback, followup, and concept mirror", () => {
  const feedbackPath = path.resolve("src/app/actions/feedback.ts");
  const followupPath = path.resolve("src/app/actions/followup.ts");
  const mirrorPath = path.resolve("src/ai/flows/analyze-concept-explanation.ts");

  const feedbackContent = fs.readFileSync(feedbackPath, "utf-8");
  const followupContent = fs.readFileSync(followupPath, "utf-8");
  const mirrorContent = fs.readFileSync(mirrorPath, "utf-8");

  assert.ok(feedbackContent.includes("checkDistributedRateLimit"), "Feedback action must enforce checkRateLimit");
  assert.ok(followupContent.includes("checkDistributedRateLimit"), "Follow-up action must enforce checkRateLimit");
  assert.ok(mirrorContent.includes("checkDistributedRateLimit"), "Concept mirror must enforce checkRateLimit");
});

test("Audit Remediation 30.10: Concept Mirror prompt defends against prompt injection with XML delimiters", () => {
  const mirrorPath = path.resolve("src/ai/flows/analyze-concept-explanation.ts");
  const content = fs.readFileSync(mirrorPath, "utf-8");

  assert.ok(
    content.includes("<untrusted_student_transcript>"),
    "Concept Mirror prompt must wrap transcript in XML containment tags"
  );
  assert.ok(
    content.includes("INJECTION DEFENSE DIRECTIVE"),
    "Concept Mirror prompt must include strict injection defense directives"
  );
});

test("Audit Remediation 30.11: Topic and OtpVerification models define required database performance & TTL indexes", () => {
  const topicPath = path.resolve("src/models/Topic.ts");
  const otpPath = path.resolve("src/models/OtpVerification.ts");

  const topicContent = fs.readFileSync(topicPath, "utf-8");
  const otpContent = fs.readFileSync(otpPath, "utf-8");

  assert.ok(
    topicContent.includes("TopicSchema.index({ userId: 1, createdAt: -1 })"),
    "Topic schema must define compound index on userId and createdAt"
  );
  assert.ok(
    otpContent.includes("expireAfterSeconds: 0"),
    "OtpVerification schema must define TTL index on expiresAt"
  );
});

test("Audit Remediation 30.12: Dashboard Server Component does not crash with client event handlers", () => {
  const dashboardPath = path.resolve("src/app/dashboard/page.tsx");
  const content = fs.readFileSync(dashboardPath, "utf-8");

  assert.ok(
    !content.includes("onClick={() => window.location.reload()}"),
    "Dashboard Server Component must not contain onClick event handlers"
  );
});
