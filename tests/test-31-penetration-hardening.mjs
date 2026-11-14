import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";


// ============================================================================
// TEST 31.1: Middleware Reconnaissance & Session Verification
// ============================================================================

test("Audit 31.1: src/middleware.ts checks verified session UUID and uses case-normalized path matching", () => {
  const middlewarePath = path.resolve("src/middleware.ts");
  const content = fs.readFileSync(middlewarePath, "utf-8");

  assert.ok(
    content.includes("verifyEdgeSessionCookie"),
    "Middleware must import and call the Edge-compatible HMAC verifier to reject bogus session tokens"
  );
  assert.ok(
    content.includes("toLowerCase()"),
    "Middleware must normalize path to lowercase to prevent 403 bypasses via URL case manipulation"
  );
  assert.ok(
    content.includes("!verifiedSessionUuid && isProtected"),
    "Middleware must redirect unverified/tampered sessions on protected routes"
  );
});

// ============================================================================
// TEST 31.2: Admin Panel Stealthing (Reconnaissance Defense)
// ============================================================================

test("Audit 31.2: src/app/dashboard/admin/page.tsx returns stealth notFound() for unauthorized visits", () => {
  const adminPagePath = path.resolve("src/app/dashboard/admin/page.tsx");
  const content = fs.readFileSync(adminPagePath, "utf-8");

  assert.ok(
    content.includes("notFound()"),
    "Admin page must invoke notFound() to return a stealth 404 to directory scanners (Gobuster/ffuf)"
  );
  assert.ok(
    !content.includes('redirect("/dashboard")'),
    "Admin page must not redirect non-admins to /dashboard, which reveals that the admin page exists"
  );
});

// ============================================================================
// TEST 31.3: IDOR Elimination in Study Group Messages
// ============================================================================

test("Audit 31.3: src/app/actions/study-groups.ts enforces group membership check on getGroupMessagesAction", () => {
  const studyGroupsPath = path.resolve("src/app/actions/study-groups.ts");
  const content = fs.readFileSync(studyGroupsPath, "utf-8");

  const getMsgSection = content.substring(
    content.indexOf("getGroupMessagesAction"),
    content.indexOf("sendGroupMessageAction")
  );

  assert.ok(
    getMsgSection.includes("memberIds.includes(user.uuid)"),
    "getGroupMessagesAction must verify caller is an authorized member before returning messages"
  );
  assert.ok(
    getMsgSection.includes("throw new Error"),
    "getGroupMessagesAction must throw an error if caller is not a member"
  );
});

// ============================================================================
// TEST 31.4: Direct Message UUID Redaction
// ============================================================================

test("Audit 31.4: src/app/actions/study-groups.ts masks sender UUID in getDirectMessagesAction", () => {
  const studyGroupsPath = path.resolve("src/app/actions/study-groups.ts");
  const content = fs.readFileSync(studyGroupsPath, "utf-8");

  const dmSection = content.substring(
    content.indexOf("getDirectMessagesAction"),
    content.indexOf("sendDirectMessageAction")
  );

  assert.ok(
    dmSection.includes("senderId: m.senderUsername"),
    "getDirectMessagesAction must map senderId to senderUsername to prevent user UUID exposure"
  );
});

// ============================================================================
// TEST 31.5: Donor Bank UTR & User UUID Redaction (Information Disclosure Defense)
// ============================================================================

test("Audit 31.5: src/app/actions/donation.ts projects out uuid, userUuid, and utr in getDonationInfoAction", () => {
  const donationPath = path.resolve("src/app/actions/donation.ts");
  const content = fs.readFileSync(donationPath, "utf-8");

  const donationInfoSection = content.substring(
    content.indexOf("getDonationInfoAction"),
    content.indexOf("submitDonationUtrAction")
  );

  assert.ok(
    donationInfoSection.includes('status: "verified"') && donationInfoSection.includes('verifiedAmount'),
    "Public donation totals must be derived only from verified bank credits"
  );
  assert.ok(
    donationInfoSection.includes('DonationTransaction.find({ isPublic: true, status: "verified" })'),
    "Public activity feed must never expose pending or rejected claims"
  );
});

// ============================================================================
// TEST 31.6: Mandatory Password on Account Deletion
// ============================================================================

test("Audit 31.6: src/app/actions/auth.ts enforces mandatory current password in deleteAccountAction", () => {
  const authPath = path.resolve("src/app/actions/auth.ts");
  const content = fs.readFileSync(authPath, "utf-8");

  const deleteAccountSection = content.substring(
    content.indexOf("deleteAccountAction"),
    content.length
  );

  assert.ok(
    deleteAccountSection.includes("if (!password)"),
    "deleteAccountAction must explicitly verify that a password was supplied"
  );
  assert.ok(
    deleteAccountSection.includes("comparePassword(password, user.password)"),
    "deleteAccountAction must compare the provided password against user.password"
  );
});

// ============================================================================
// TEST 31.7: Global Per-Account Rate Limiting on Login (Credential Stuffing Defense)
// ============================================================================

test("Audit 31.7: src/app/actions/auth.ts enforces global per-account rate limit on loginAction", () => {
  const authPath = path.resolve("src/app/actions/auth.ts");
  const content = fs.readFileSync(authPath, "utf-8");

  const loginSection = content.substring(
    content.indexOf("loginAction"),
    content.indexOf("logoutAction")
  );

  assert.ok(
    loginSection.includes("login:account:"),
    "loginAction must track failed login attempts globally per account"
  );
  assert.ok(
    loginSection.includes("recordDistributedFailedAttempt(accountRateKey"),
    "loginAction must record failed attempts on the account key"
  );
  assert.ok(
    loginSection.includes("resetDistributedRateLimit(accountRateKey"),
    "loginAction must reset the account key upon successful authentication"
  );
});

// ============================================================================
// TEST 31.8: AI Prompt Injection Defense Across All LLM Pipelines
// ============================================================================

test("Audit 31.8: AI prompt flows contain XML containment delimiters and injection defense directives", () => {
  const summaryFlowPath = path.resolve("src/ai/flows/generate-topic-summary.ts");
  const questionsFlowPath = path.resolve("src/ai/flows/generate-questions.ts");
  const analyzeAnswersPath = path.resolve("src/ai/flows/analyze-answers.ts");
  const mistakesActionPath = path.resolve("src/app/actions/mistakes.ts");

  const summaryContent = fs.readFileSync(summaryFlowPath, "utf-8");
  const questionsContent = fs.readFileSync(questionsFlowPath, "utf-8");
  const answersContent = fs.readFileSync(analyzeAnswersPath, "utf-8");
  const mistakesContent = fs.readFileSync(mistakesActionPath, "utf-8");

  assert.ok(
    summaryContent.includes("<untrusted_topic>") && summaryContent.includes("INJECTION DEFENSE DIRECTIVE"),
    "generate-topic-summary must encapsulate topic in XML containment tags with injection directive"
  );
  assert.ok(
    questionsContent.includes("<untrusted_summary>") && questionsContent.includes("INJECTION DEFENSE DIRECTIVE"),
    "generate-questions must encapsulate summary in XML containment tags with injection directive"
  );
  assert.ok(
    answersContent.includes("<untrusted_student_answers>") && answersContent.includes("INJECTION DEFENSE DIRECTIVE"),
    "analyze-answers must encapsulate student answers in XML containment tags with injection directive"
  );
  assert.ok(
    mistakesContent.includes("<untrusted_student_mistakes>") && mistakesContent.includes("INJECTION DEFENSE DIRECTIVE"),
    "generateMistakeQuizAction must encapsulate mistakes in XML containment tags with injection directive"
  );
});

// ============================================================================
// TEST 31.9: Social Profile URL Injection Sanitization
// ============================================================================

test("Audit 31.9: src/app/dashboard/aspirants-connect/page.tsx sanitizes Snapchat and Instagram URLs with encodeURIComponent", () => {
  const aspirantsPagePath = path.resolve("src/app/dashboard/aspirants-connect/page.tsx");
  const content = fs.readFileSync(aspirantsPagePath, "utf-8");

  assert.ok(
    content.includes("https://snapchat.com/add/${encodeURIComponent"),
    "Aspirants Connect must sanitize snapchat URLs with encodeURIComponent"
  );
  assert.ok(
    content.includes("https://instagram.com/${encodeURIComponent"),
    "Aspirants Connect must sanitize instagram URLs with encodeURIComponent"
  );
});

// ============================================================================
// TEST 31.10: robots.txt Scraper Defense & next.config.mjs Hardening
// ============================================================================

test("Audit 31.10: robots.ts and next.config.mjs defend against crawler fuzzing and header fingerprinting", () => {
  const robotsPath = path.resolve("src/app/robots.ts");
  const nextConfigPath = path.resolve("next.config.mjs");

  const robotsContent = fs.readFileSync(robotsPath, "utf-8");
  const nextConfigContent = fs.readFileSync(nextConfigPath, "utf-8");

  assert.ok(
    robotsContent.includes("disallow: ['/dashboard/', '/api/', '/auth/']"),
    "robots.ts must disallow private dynamic paths from crawlers"
  );
  assert.ok(
    nextConfigContent.includes("poweredByHeader: false"),
    "next.config.mjs must disable X-Powered-By header to prevent framework fingerprinting"
  );
  assert.ok(
    nextConfigContent.includes("Content-Security-Policy"),
    "next.config.mjs must declare Content-Security-Policy"
  );
  assert.ok(
    nextConfigContent.includes("Permissions-Policy"),
    "next.config.mjs must declare Permissions-Policy"
  );
});
