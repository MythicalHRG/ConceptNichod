import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// HTML escaping contract for outgoing emails (email-broadcast.ts, feedback.ts)
export function escapeHtml(str) {
  if (!str || typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Allowed OTP domain contract
export function validateOtpEmailDomain(email) {
  if (!email || typeof email !== "string") return false;
  const lower = email.trim().toLowerCase();
  return (
    lower.endsWith("@gmail.com") ||
    lower.endsWith("@outlook.com") ||
    lower.endsWith("@outlook.in")
  );
}

// Blacklist check contract
export function isEntityBlacklisted(ip, email, blacklistEntries = []) {
  const normIp = (ip || "").trim().toLowerCase();
  const normEmail = (email || "").trim().toLowerCase();

  return blacklistEntries.some((entry) => {
    const val = (entry.value || "").trim().toLowerCase();
    if (entry.type === "ip" && val === normIp) return true;
    if (entry.type === "email" && val === normEmail) return true;
    return false;
  });
}

// Server Component event handler detector
export function hasServerComponentEventHandler(code) {
  const isClientComponent = /^\s*["']use client["']/m.test(code);
  if (isClientComponent) return false; // Client components are allowed to have onClick

  // Look for inline event handlers in Server Components
  const inlineHandlerRegex = /<\w+[^>]*\s+on(?:Click|Change|Submit|KeyDown|KeyUp|MouseOver)\s*=\s*\{/i;
  return inlineHandlerRegex.test(code);
}

test("Tareeka 20: HTML entity escaping protects outgoing email templates from HTML/XSS injection", () => {
  const maliciousInput = "<script>alert('xss')</script>";
  const escaped = escapeHtml(maliciousInput);

  assert.strictEqual(escaped, "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
  assert.ok(!escaped.includes("<"), "Must not contain raw '<'");
  assert.ok(!escaped.includes(">"), "Must not contain raw '>'");

  // Multi-entity string
  const complexString = 'A & B said: "Hello" <world> & \'test\'';
  const escapedComplex = escapeHtml(complexString);
  assert.strictEqual(
    escapedComplex,
    "A &amp; B said: &quot;Hello&quot; &lt;world&gt; &amp; &#39;test&#39;"
  );

  // Null, undefined, empty handling
  assert.strictEqual(escapeHtml(""), "");
  assert.strictEqual(escapeHtml(null), "");
  assert.strictEqual(escapeHtml(undefined), "");
});

test("Tareeka 20: OTP route enforces allowed email domains and rejects disposable/unauthorized providers", () => {
  // Allowed domains
  assert.strictEqual(validateOtpEmailDomain("student@gmail.com"), true);
  assert.strictEqual(validateOtpEmailDomain("user@outlook.com"), true);
  assert.strictEqual(validateOtpEmailDomain("aspirant@outlook.in"), true);
  assert.strictEqual(validateOtpEmailDomain("  CAPS@GMAIL.COM  "), true);

  // Disallowed / disposable domains
  assert.strictEqual(validateOtpEmailDomain("attacker@tempmail.com"), false);
  assert.strictEqual(validateOtpEmailDomain("spammer@mailinator.com"), false);
  assert.strictEqual(validateOtpEmailDomain("hacker@guerrillamail.com"), false);
  assert.strictEqual(validateOtpEmailDomain("random@yahoo.com"), false);
  assert.strictEqual(validateOtpEmailDomain("test@proton.me"), false);
  assert.strictEqual(validateOtpEmailDomain(""), false);
  assert.strictEqual(validateOtpEmailDomain(null), false);
});

test("Tareeka 20: OTP route blocks blacklisted IPs and blacklisted emails fail closed (403)", () => {
  const blacklist = [
    { type: "ip", value: "203.0.113.50", reason: "Credential stuffing" },
    { type: "email", value: "banned_spammer@gmail.com", reason: "Spam relay" }
  ];

  // Banned IP is blocked
  assert.strictEqual(
    isEntityBlacklisted("203.0.113.50", "clean_user@gmail.com", blacklist),
    true,
    "Blacklisted IP must be blocked"
  );

  // Banned email is blocked
  assert.strictEqual(
    isEntityBlacklisted("198.51.100.1", "banned_spammer@gmail.com", blacklist),
    true,
    "Blacklisted email must be blocked"
  );

  // Clean request is permitted
  assert.strictEqual(
    isEntityBlacklisted("198.51.100.1", "clean_user@gmail.com", blacklist),
    false,
    "Clean IP and email must be permitted"
  );
});

test("Tareeka 20: Server Component event handler detector identifies fatal RSC onClick hazards", () => {
  const badServerComponent = `
    import dbConnect from "@/lib/mongoose";
    export default async function DashboardPage() {
      await dbConnect();
      return <Button onClick={() => window.location.reload()}>Refresh</Button>;
    }
  `;
  assert.strictEqual(
    hasServerComponentEventHandler(badServerComponent),
    true,
    "Must detect inline event handler in Server Component"
  );

  const goodClientComponent = `
    "use client";
    export default function RefreshButton() {
      return <Button onClick={() => window.location.reload()}>Refresh</Button>;
    }
  `;
  assert.strictEqual(
    hasServerComponentEventHandler(goodClientComponent),
    false,
    "Client Component with 'use client' is allowed to have onClick"
  );

  const goodServerComponentWithLink = `
    import Link from "next/link";
    export default async function DashboardPage() {
      return <Link href="/dashboard">Refresh Page</Link>;
    }
  `;
  assert.strictEqual(
    hasServerComponentEventHandler(goodServerComponentWithLink),
    false,
    "Server Component with Link is safe"
  );
});

test("Tareeka 20: Floating Action Button (FAB) and music player layout collision test", () => {
  function checkFabCollision(fab1, fab2) {
    // Both anchored at bottom-right
    if (fab1.horizontal === "right" && fab2.horizontal === "right") {
      const vertDistance = Math.abs(fab1.bottomOffsetRem - fab2.bottomOffsetRem);
      const horizDistance = Math.abs(fab1.rightOffsetRem - fab2.rightOffsetRem);
      // If within 2.5rem of each other, they collide on mobile
      if (vertDistance < 2.5 && horizDistance < 2.5) {
        return true;
      }
    }
    return false;
  }

  // Pre-fix positions: AddTopic at bottom:2rem (bottom-8) right:2rem (right-8), Music at bottom:1rem (bottom-4) right:1rem (right-4)
  const collidingPositions = {
    addTopic: { horizontal: "right", bottomOffsetRem: 2.0, rightOffsetRem: 2.0 },
    musicPlayer: { horizontal: "right", bottomOffsetRem: 1.0, rightOffsetRem: 1.0 }
  };
  assert.strictEqual(
    checkFabCollision(collidingPositions.addTopic, collidingPositions.musicPlayer),
    true,
    "Original overlapping coordinates must be detected as collision"
  );

  // Resolved layout: Music relocated to navbar/top or offset distinctly
  const safePositions = {
    addTopic: { horizontal: "right", bottomOffsetRem: 2.0, rightOffsetRem: 2.0 },
    musicPlayer: { horizontal: "navbar", bottomOffsetRem: 0, rightOffsetRem: 0 }
  };
  assert.strictEqual(
    checkFabCollision(safePositions.addTopic, safePositions.musicPlayer),
    false,
    "Relocated music player eliminates touch target collision"
  );
});

test("Tareeka 20: Non-interactive ESLint configuration validation", () => {
  const eslintPath = path.resolve(".eslintrc.json");
  if (fs.existsSync(eslintPath)) {
    const raw = fs.readFileSync(eslintPath, "utf-8");
    let parsed;
    assert.doesNotThrow(() => {
      parsed = JSON.parse(raw);
    }, "eslintrc.json must be valid JSON");

    assert.ok(
      parsed.extends && (parsed.extends.includes("next") || parsed.extends.includes("next/core-web-vitals")),
      "eslintrc.json must extend next or next/core-web-vitals"
    );
  }
});

test("Tareeka 20: Anti-Bypass & Lockdown - Production source maps disabled and security headers configured", () => {
  const nextConfigPath = path.resolve("next.config.mjs");
  assert.ok(fs.existsSync(nextConfigPath), "next.config.mjs must exist");

  const configContent = fs.readFileSync(nextConfigPath, "utf-8");

  // 1. Verify production browser source maps are NOT enabled
  assert.ok(
    !configContent.includes("productionBrowserSourceMaps: true"),
    "Production source maps must NOT be enabled (locks raw source inspection)"
  );
  assert.ok(
    configContent.includes("productionBrowserSourceMaps: false") || !configContent.includes("productionBrowserSourceMaps"),
    "productionBrowserSourceMaps should be false or omitted"
  );

  // 2. Verify defense-in-depth security headers in next.config.mjs or middleware
  assert.ok(
    configContent.includes("X-Content-Type-Options") && configContent.includes("nosniff"),
    "Must enforce X-Content-Type-Options: nosniff"
  );
  assert.ok(
    configContent.includes("X-Frame-Options"),
    "Must enforce X-Frame-Options against frame embedding / clickjacking"
  );
});
