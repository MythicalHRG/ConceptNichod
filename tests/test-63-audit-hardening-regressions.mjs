import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("sessions bind expiry and account session version", () => {
  const session = read("src/lib/session.ts");
  const sessionAuth = read("src/lib/session-auth.ts");
  assert.match(session, /SESSION_TTL_SECONDS/);
  assert.match(session, /sessionVersion/);
  assert.match(session, /expiresAt/);
  assert.match(sessionAuth, /getSessionVersionFromCookie/);
  assert.match(sessionAuth, /effectiveTokenVersion === currentVersion/);
});

test("client IP uses the Vercel-overwritten source, not client forwarding headers", () => {
  const source = read("src/lib/ip.ts");
  assert.match(source, /headerList\.get\("x-real-ip"\)/);
  assert.doesNotMatch(source, /x-forwarded-for|cf-connecting-ip/i);
});

test("public donation reads are pure and submission honors the admin switch", () => {
  const source = read("src/app/actions/donation.ts");
  const helper = source.slice(source.indexOf("async function getCanonicalDonationSettings"), source.indexOf("async function saveCanonicalDonationSettings"));
  assert.doesNotMatch(helper, /updateMany|findByIdAndUpdate|create\(/);
  assert.match(source, /Donations are currently disabled/);
  assert.match(source, /saveCanonicalDonationSettings\(\{ isEnabled: enabled/);
  assert.match(source, /isEnabled: settings\?\.isEnabled === true/);
});

test("OpenRouter calls have bounded input, output and retry budgets without raw error logging", () => {
  const source = read("src/lib/openrouter.ts");
  assert.match(source, /MAX_OPENROUTER_INPUT_CHARS/);
  assert.match(source, /MAX_OPENROUTER_REQUEST_ATTEMPTS/);
  assert.match(source, /max_tokens: maxOutputTokens/);
  assert.doesNotMatch(source, /errorBody|console\.(?:warn|error)\([^\n]*data\.error/);
  assert.doesNotMatch(source, /response snippet.*text\.slice/i);
});

test("auth actions do not return raw exception messages", () => {
  const source = read("src/app/actions/auth.ts");
  assert.match(source, /getSafeRegistrationError/);
  assert.doesNotMatch(source, /error:\s*e\?\.message/);
});

test("public profiles require explicit user opt-in", () => {
  const model = read("src/models/User.ts");
  const profile = read("src/app/actions/profile.ts");
  const ui = read("src/components/auth/user-profile-button.tsx");
  assert.match(model, /publicProfileEnabled: \{ type: Boolean, default: false \}/);
  assert.match(profile, /user\.publicProfileEnabled !== true/);
  assert.match(ui, /Make my profile public/);
});

test("UploadThing file URLs are not written to logs", () => {
  const source = read("src/app/api/uploadthing/core.ts");
  assert.doesNotMatch(source, /console\.(?:log|info|warn|error)\([^\n]*fileUrl/);
  assert.doesNotMatch(source, /console\.(?:log|info|warn|error)\([^\n]*file url/i);
});
