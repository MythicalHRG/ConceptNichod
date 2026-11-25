import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(path.resolve(file), "utf8");

test("LaTeX repair restores corrupted commands and leaves unmatched dollar prose unconsumed", () => {
  const source = read("src/components/ui/latex-renderer.tsx");
  assert.match(source, /export function repairCorruptedLatex/);
  assert.match(source, /\.replace\(\/\\t\(\?=/);
  assert.match(source, /\.replace\(\/\\r\?\\n\(\?=/);
  assert.ok(source.includes(String.raw`.replace(/\\textemptyset\b/g, '\\emptyset')`));
  assert.ok(source.includes(String.raw`.replace(/\\textbraceleft\b/g, '\\{')`));
  assert.ok(source.includes(String.raw`'\\neq'`), "neq must be recognized as a bare TeX symbol");
  assert.match(source, /if \(mathEnd !== -1 && mathEnd > mathStart\)/);
  assert.match(source, /flushText\(text\.length\)/);
});

test("Profile AI authenticates, checks blacklist/rate limits, and uses public-only escaped prompt data", () => {
  const source = read("src/app/actions/profile-ai.ts");
  assert.match(source, /getVerifiedSessionUuid\(sessionCookie\)/);
  assert.match(source, /assertActiveNonBlacklistedUser\(sessionUuid\)/);
  assert.match(source, /checkDistributedRateLimit\(/);
  assert.match(source, /getPublicProfileData\(cleanUsername\)/);
  assert.match(source, /<untrusted_profile_data>/);
  assert.match(source, /<untrusted_user_question>/);
  assert.match(source, /escapeXmlContent\(JSON\.stringify\(publicSummary/);
  assert.doesNotMatch(source, /profileData\.(?:email|ip|dob|uuid|password)|profileData\.user\.(?:email|ip|dob|uuid|password)/i);
});

test("all three analytics views normalize five-axis polygon radar charts", () => {
  const profile = read("src/components/profile/user-analytics.tsx");
  const mirror = read("src/components/concept-mirror/mastery-dashboard.tsx");
  const finalAnalysis = read("src/components/topic/final-analysis-display.tsx");

  assert.match(profile, /buildProfilePentagonData/);
  assert.match(profile, /gridType="polygon"/);
  assert.match(mirror, /normalizeMirrorPentagon/);
  assert.match(mirror, /gridType="polygon"/);
  assert.match(finalAnalysis, /normalizePentagonRadarData/);
  assert.match(finalAnalysis, /gridType="polygon"/);
});

test("practice proctoring registers every required lifecycle and focus listener", () => {
  const source = read("src/components/topic/practice-analysis-section.tsx");
  for (const event of ["visibilitychange", "pagehide", "beforeunload", "popstate", "fullscreenchange", "blur"]) {
    assert.ok(source.includes(`addEventListener("${event}"`), `Missing ${event} listener`);
  }
});

test("AES-GCM decryption explicitly fixes the authentication tag length", () => {
  const source = read("src/lib/encryption.ts");
  assert.match(source, /createDecipheriv\('aes-256-gcm', key, iv, \{ authTagLength: 16 \}\)/);
});

test("no SimpleX-named files exist in the repository or src tree", () => {
  const ignored = new Set([".git", "node_modules", ".next", ".vercel"]);
  const matches = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (directory === "." && ignored.has(entry.name)) continue;
      const relative = path.join(directory, entry.name);
      if (/simplex/i.test(entry.name)) matches.push(relative);
      if (entry.isDirectory()) visit(relative);
    }
  };
  visit(".");
  assert.deepEqual(matches, [], `Unexpected SimpleX files: ${matches.join(", ")}`);
});
