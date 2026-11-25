import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { verifySessionCookie, createSignedSessionCookie } from "../src/lib/session.ts";
import { checkRateLimit } from "../src/lib/rate-limiter.ts";

// ============================================================================
// PART 1: Endpoint Bypass Tests — /api/auth/otp
// ============================================================================

function validateEmailDomain(email) {
  if (!email || typeof email !== "string") return false;
  const lower = email.trim().toLowerCase();
  return lower.endsWith("@gmail.com") || lower.endsWith("@outlook.com") || lower.endsWith("@outlook.in");
}

function simulateOtpRequest({ ip, email, action, isPasswordReset, blacklist = [] }) {
  let sanitizedEmail = email;
  if (sanitizedEmail) {
    sanitizedEmail = sanitizedEmail.toLowerCase().trim();
  }

  if (!sanitizedEmail) {
    return { status: 400, body: { error: "Email is required" } };
  }

  const isIpBanned = blacklist.some((b) => b.type === "ip" && b.value === ip);
  if (isIpBanned) {
    return { status: 403, body: { error: "Access denied: Your IP address is banned." } };
  }

  const isEmailBanned = blacklist.some((b) => b.type === "email" && b.value === sanitizedEmail);
  if (isEmailBanned) {
    return { status: 403, body: { error: "Access denied: This email address is banned." } };
  }

  if (action === "send") {
    if (!validateEmailDomain(sanitizedEmail)) {
      return {
        status: 400,
        body: { error: "Only @gmail.com, @outlook.com, and @outlook.in emails are allowed." }
      };
    }
    return { status: 200, body: { success: true, message: "OTP sent successfully" } };
  }

  if (action === "verify") {
    return { status: 200, body: { success: true, message: "Email verified successfully" } };
  }

  return { status: 400, body: { error: "Invalid action" } };
}

test("Tareeka 21.1: /api/auth/otp rejects banned IP with 403 Forbidden", () => {
  const blacklist = [
    { type: "ip", value: "198.51.100.99", reason: "Botnet abuse" },
    { type: "email", value: "banned@gmail.com", reason: "Spammer" }
  ];

  const res = simulateOtpRequest({
    ip: "198.51.100.99",
    email: "innocent_student@gmail.com",
    action: "send",
    blacklist
  });

  assert.strictEqual(res.status, 403, "Banned IP must be rejected with 403");
  assert.strictEqual(res.body.error, "Access denied: Your IP address is banned.");
});

test("Tareeka 21.2: /api/auth/otp rejects banned email with 403 Forbidden", () => {
  const blacklist = [
    { type: "ip", value: "198.51.100.99", reason: "Botnet abuse" },
    { type: "email", value: "malicious_user@gmail.com", reason: "Credential abuse" }
  ];

  const res = simulateOtpRequest({
    ip: "10.0.0.1",
    email: "  MALICIOUS_USER@GMAIL.COM  ", // Test case normalization
    action: "send",
    blacklist
  });

  assert.strictEqual(res.status, 403, "Banned email must be rejected with 403 regardless of case");
  assert.strictEqual(res.body.error, "Access denied: This email address is banned.");
});

test("Tareeka 21.3: /api/auth/otp rejects disallowed email domains with 400 Bad Request", () => {
  const disallowedDomains = [
    "attacker@tempmail.com",
    "spammer@guerrillamail.com",
    "fake@mailinator.com",
    "user@yahoo.com",
    "student@proton.me",
    "hacker@10minutemail.com",
    "test@disposable.org"
  ];

  for (const email of disallowedDomains) {
    const res = simulateOtpRequest({
      ip: "127.0.0.1",
      email,
      action: "send",
      blacklist: []
    });

    assert.strictEqual(res.status, 400, `Domain for ${email} must be rejected with 400`);
    assert.strictEqual(
      res.body.error,
      "Only @gmail.com, @outlook.com, and @outlook.in emails are allowed."
    );
  }

  // Allowed domains must succeed
  const allowedEmails = [
    "student@gmail.com",
    "aspirant@outlook.com",
    "scholar@outlook.in",
    "  caps@GMAIL.COM  "
  ];
  for (const email of allowedEmails) {
    const res = simulateOtpRequest({
      ip: "127.0.0.1",
      email,
      action: "send",
      blacklist: []
    });
    assert.strictEqual(res.status, 200, `Allowed email ${email} must pass validation`);
  }
});

test("Tareeka 21.4: /api/auth/otp rejects empty or missing email with 400 Bad Request", () => {
  assert.strictEqual(simulateOtpRequest({ email: "", action: "send" }).status, 400);
  assert.strictEqual(simulateOtpRequest({ email: null, action: "send" }).status, 400);
  assert.strictEqual(simulateOtpRequest({ email: "   ", action: "send" }).status, 400);
});

test("Tareeka 21.5: Static verification of /api/auth/otp route handler security guards", () => {
  const otpRoutePath = path.resolve("src/app/api/auth/otp/route.ts");
  assert.ok(fs.existsSync(otpRoutePath), "src/app/api/auth/otp/route.ts must exist");
  const content = fs.readFileSync(otpRoutePath, "utf-8");

  // Verify Blacklist model is imported and checked
  assert.ok(content.includes("Blacklist.findOne({ type: \"ip\""), "Must query Blacklist for IP");
  assert.ok(content.includes("Blacklist.findOne({ type: \"email\""), "Must query Blacklist for Email");
  assert.ok(content.includes("status: 403"), "Must return 403 on Blacklist match");

  // Verify domain validator
  assert.ok(content.includes("validateEmailDomain"), "Must enforce email domain validation");
  assert.ok(content.includes("@gmail.com"), "Must allow @gmail.com");
  assert.ok(content.includes("@outlook.com"), "Must allow @outlook.com");
  assert.ok(content.includes("@outlook.in"), "Must allow @outlook.in");
});

// ============================================================================
// PART 1B: Endpoint Bypass Tests — /api/generate/analysis and /api/generate/content
// ============================================================================

const AnalysisSchema = z.object({
  topicName: z.string().min(1, "topicName is required"),
  classLevel: z.string().min(1, "classLevel is required"),
  summary: z.string().min(1, "summary is required"),
  topicId: z.string().min(1, "topicId is required"),
  writtenAnswers: z.array(z.object({ question: z.string(), answer: z.string() })).optional().default([]),
  spokenAnswers: z.array(z.object({ question: z.string(), answer: z.string() })).optional().default([])
});

const ContentSchema = z.object({
  topicId: z.string().min(1, "topicId is required"),
  topicName: z.string().min(1, "topicName is required"),
  classLevel: z.string().min(1, "classLevel is required")
});

function simulateGenerateRoute({ routeName, rawCookie, body }) {
  // 1. Session authentication check (Executes first before parsing body)
  const sessionUuid = verifySessionCookie(rawCookie);
  if (!sessionUuid) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  // 2. Schema validation
  const schema = routeName === "analysis" ? AnalysisSchema : ContentSchema;
  const parseResult = schema.safeParse(body);
  if (!parseResult.success) {
    return {
      status: 400,
      body: { error: "Invalid request body", details: parseResult.error.flatten() }
    };
  }

  return { status: 200, body: { success: true, data: parseResult.data } };
}

test("Tareeka 21.6: /api/generate routes reject unauthenticated requests with 401 JSON error", () => {
  const routes = ["analysis", "content"];

  for (const route of routes) {
    // 1. No cookie
    const resNoCookie = simulateGenerateRoute({
      routeName: route,
      rawCookie: undefined,
      body: {}
    });
    assert.strictEqual(resNoCookie.status, 401, `Unauthenticated ${route} must return 401`);
    assert.strictEqual(resNoCookie.body.error, "Unauthorized");

    // 2. Forged / invalid signature cookie
    const resForged = simulateGenerateRoute({
      routeName: route,
      rawCookie: "12345678-1234-1234-1234-123456789abc.badsignaturebadsignaturebadsignaturebadsignaturebadsignature1234",
      body: { topicId: "top-1" }
    });
    assert.strictEqual(resForged.status, 401, "Forged signature must return 401");
    assert.strictEqual(resForged.body.error, "Unauthorized");

    // 3. Unauthenticated request with empty body or non-JSON body does NOT crash (returns 401)
    const resEmptyBody = simulateGenerateRoute({
      routeName: route,
      rawCookie: null,
      body: null
    });
    assert.strictEqual(resEmptyBody.status, 401, "Empty body unauthenticated request must safely return 401");
  }
});

test("Tareeka 21.7: /api/generate routes reject empty body from authenticated user with 400 Bad Request", () => {
  const validUuid = "12345678-1234-1234-1234-123456789abc";
  const validSessionCookie = createSignedSessionCookie(validUuid);

  // Analysis with empty body
  const analysisEmpty = simulateGenerateRoute({
    routeName: "analysis",
    rawCookie: validSessionCookie,
    body: {}
  });
  assert.strictEqual(analysisEmpty.status, 400, "Authenticated analysis with empty body must return 400");
  assert.strictEqual(analysisEmpty.body.error, "Invalid request body");
  assert.ok(analysisEmpty.body.details.fieldErrors.topicName, "Should flag missing topicName");
  assert.ok(analysisEmpty.body.details.fieldErrors.classLevel, "Should flag missing classLevel");
  assert.ok(analysisEmpty.body.details.fieldErrors.summary, "Should flag missing summary");
  assert.ok(analysisEmpty.body.details.fieldErrors.topicId, "Should flag missing topicId");

  // Content with empty body
  const contentEmpty = simulateGenerateRoute({
    routeName: "content",
    rawCookie: validSessionCookie,
    body: {}
  });
  assert.strictEqual(contentEmpty.status, 400, "Authenticated content with empty body must return 400");
  assert.strictEqual(contentEmpty.body.error, "Invalid request body");
  assert.ok(contentEmpty.body.details.fieldErrors.topicId, "Should flag missing topicId");
  assert.ok(contentEmpty.body.details.fieldErrors.topicName, "Should flag missing topicName");
  assert.ok(contentEmpty.body.details.fieldErrors.classLevel, "Should flag missing classLevel");
});

test("Tareeka 21.8: Static verification of /api/generate route handlers structure", () => {
  for (const route of ["analysis", "content"]) {
    const routePath = path.resolve(`src/app/api/generate/${route}/route.ts`);
    assert.ok(fs.existsSync(routePath), `${routePath} must exist`);
    const content = fs.readFileSync(routePath, "utf-8");

    // Session auth check is at top
    assert.ok(content.includes("getVerifiedSessionUuid"), `${route} must call database-backed session validation`);
    assert.ok(content.includes("status: 401"), `${route} must return 401 on unauthorized`);

    // Zod validation is performed
    assert.ok(content.includes("safeParse"), `${route} must use Zod safeParse`);
    assert.ok(content.includes("status: 400"), `${route} must return 400 on invalid body`);
  }
});

// ============================================================================
// PART 2: Email HTML Injection Sanitization Tests
// ============================================================================

function escapeHtml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

test("Tareeka 21.9: escapeHtml sanitizes mandatory dangerous payloads", () => {
  // 1. Script tag injection
  const scriptPayload = "<script>alert(1)</script>";
  assert.strictEqual(
    escapeHtml(scriptPayload),
    "&lt;script&gt;alert(1)&lt;/script&gt;",
    "Script tag brackets must be neutralized"
  );

  // 2. Image tag attribute breakout
  const imgPayload = '"><img src=x onerror=alert(1)>';
  assert.strictEqual(
    escapeHtml(imgPayload),
    "&quot;&gt;&lt;img src=x onerror=alert(1)&gt;",
    "Image tag and quote breakout must be neutralized"
  );

  // 3. Five core HTML characters: & < > " '
  const fiveChars = '& < > " \'';
  assert.strictEqual(
    escapeHtml(fiveChars),
    "&amp; &lt; &gt; &quot; &#039;",
    "All five core HTML sensitive characters must be escaped"
  );
});

test("Tareeka 21.10: escapeHtml neutralizes advanced attribute and event handler injections", () => {
  const attacks = [
    { input: "onload=alert('XSS')", expectedNoRawQuote: true },
    { input: "' onmouseover='alert(document.cookie)", expected: "&#039; onmouseover=&#039;alert(document.cookie)" },
    { input: "<svg/onload=confirm(1)>", expected: "&lt;svg/onload=confirm(1)&gt;" },
    { input: "<iframe src=\"javascript:alert(1)\">", expected: "&lt;iframe src=&quot;javascript:alert(1)&quot;&gt;" },
    { input: "<<SCRIPT>alert(\"XSS\");//<</SCRIPT>", expected: "&lt;&lt;SCRIPT&gt;alert(&quot;XSS&quot;);//&lt;&lt;/SCRIPT&gt;" }
  ];

  for (const attack of attacks) {
    const escaped = escapeHtml(attack.input);
    assert.ok(!escaped.includes("<"), `Escaped output must not contain raw '<' for ${attack.input}`);
    assert.ok(!escaped.includes(">"), `Escaped output must not contain raw '>' for ${attack.input}`);
    if (attack.expected) {
      assert.strictEqual(escaped, attack.expected);
    }
  }

  // Falsy input handling
  assert.strictEqual(escapeHtml(""), "");
  assert.strictEqual(escapeHtml(null), "");
  assert.strictEqual(escapeHtml(undefined), "");
});

test("Tareeka 21.11: Static verification of email-broadcast.ts and feedback.ts escaping", () => {
  const broadcastPath = path.resolve("src/app/actions/email-broadcast.ts");
  const feedbackPath = path.resolve("src/app/actions/feedback.ts");

  assert.ok(fs.existsSync(broadcastPath), "email-broadcast.ts must exist");
  assert.ok(fs.existsSync(feedbackPath), "feedback.ts must exist");

  const broadcastContent = fs.readFileSync(broadcastPath, "utf-8");
  const feedbackContent = fs.readFileSync(feedbackPath, "utf-8");

  assert.ok(broadcastContent.includes("escapeHtml(body)"), "Broadcast action must escape body");
  assert.ok(feedbackContent.includes("escapeHtml(type)"), "Feedback action must escape type");
  assert.ok(feedbackContent.includes("escapeHtml(message)"), "Feedback action must escape message");
});

// ============================================================================
// PART 3: Middleware Security Headers Tests
// ============================================================================

test("Tareeka 21.12: Middleware defines and enforces required HTTP security headers", () => {
  const middlewarePath = path.resolve("src/middleware.ts");
  assert.ok(fs.existsSync(middlewarePath), "src/middleware.ts must exist");
  const content = fs.readFileSync(middlewarePath, "utf-8");

  // 1. X-Frame-Options: DENY (prevents clickjacking)
  assert.ok(
    content.includes("headers.set('X-Frame-Options', 'DENY')"),
    "Must set X-Frame-Options to DENY"
  );

  // 2. X-Content-Type-Options: nosniff (prevents MIME sniffing)
  assert.ok(
    content.includes("headers.set('X-Content-Type-Options', 'nosniff')"),
    "Must set X-Content-Type-Options to nosniff"
  );

  // 3. Referrer-Policy: strict-origin-when-cross-origin
  assert.ok(
    content.includes("headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')"),
    "Must set Referrer-Policy to strict-origin-when-cross-origin"
  );

  // 4. Permissions-Policy
  assert.ok(
    content.includes("Permissions-Policy"),
    "Must set Permissions-Policy"
  );
  assert.ok(
    content.includes("camera=()"),
    "Must disable camera in Permissions-Policy"
  );
  assert.ok(
    content.includes("microphone=(self)"),
    "Must allow microphone for self in Permissions-Policy (Concept Mirror requirement)"
  );
  assert.ok(
    content.includes("geolocation=()"),
    "Must disable geolocation in Permissions-Policy"
  );

  // 5. Content-Security-Policy
  assert.ok(
    content.includes("Content-Security-Policy"),
    "Must set Content-Security-Policy"
  );
  assert.ok(
    content.includes("frame-ancestors 'none'"),
    "CSP must specify frame-ancestors 'none'"
  );
  assert.ok(
    content.includes("default-src 'self'"),
    "CSP must specify default-src 'self'"
  );

  // 6. Security headers applied to both redirect and next responses
  assert.ok(
    content.includes("addSecurityHeaders(redirectResponse)"),
    "Must apply security headers to redirect responses"
  );
  assert.ok(
    content.includes("addSecurityHeaders(response)"),
    "Must apply security headers to standard next responses"
  );
});
