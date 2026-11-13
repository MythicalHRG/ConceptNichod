import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const auth = fs.readFileSync("src/app/actions/auth.ts", "utf8");

test("profile updates do not reject a user's unchanged username as already taken", () => {
  assert.match(
    auth,
    /if \(targetUsername !== currentUser\.username\.toLowerCase\(\)\) \{\s*const usernameError = await validateUsername\(targetUsername\);/
  );
});

test("failed password attempts are counted once and database save errors are not treated as bad passwords", () => {
  const loginStart = auth.indexOf("export async function loginAction");
  const loginEnd = auth.indexOf("export async function logoutAction", loginStart);
  assert.notEqual(loginStart, -1);
  assert.notEqual(loginEnd, -1);
  const login = auth.slice(loginStart, loginEnd);
  assert.equal((login.match(/recordFailedAttempt\(accountRateKey/g) || []).length, 2);
  assert.equal((login.match(/recordFailedAttempt\(loginRateKey/g) || []).length, 2);
  assert.match(login, /const isValid = await comparePassword\(password, user\.password\);[\s\S]*?if \(!isValid\) \{[\s\S]*?await user\.save\(\);/);
});

test("registration rejects expired or missing-expiry email OTP records", () => {
  const registerStart = auth.indexOf("export async function registerAction");
  const registerEnd = auth.indexOf("export async function loginAction", registerStart);
  const register = auth.slice(registerStart, registerEnd);
  assert.match(register, /!otpRecord \\|\\| !otpRecord\.isVerified \\|\\| !otpRecord\.expiresAt \\|\\| new Date\(\) > otpRecord\.expiresAt/);
  assert.match(register, /await dbConnect\(\);[\\s\\S]*?if \(!email \\|\\| !username/);
});

test("donation payments remain disabled until an explicit deployment opt-in", () => {
  const donation = fs.readFileSync("src/app/actions/donation.ts", "utf8");
  const settings = fs.readFileSync("src/models/DonationSetting.ts", "utf8");
  const page = fs.readFileSync("src/app/donate/page.tsx", "utf8");
  assert.match(donation, /process\.env\.DONATIONS_ENABLED === "true"/);
  assert.match(donation, /if \(!DONATIONS_ENABLED\)[\s\S]*?Donations are temporarily unavailable/);
  assert.match(settings, /upiId: \{ type: String, default: "" \}/);
  assert.doesNotMatch(page, /harsh\.2525@ptaxis/);
  assert.match(page, /receiverUpiId \?/);
});

test("AI generation and text-to-speech server actions enforce per-user rate limits", () => {
  const actions = fs.readFileSync("src/app/actions.ts", "utf8");
  assert.ok(actions.includes("generate-content:${sessionUuid}"));
  assert.ok(actions.includes("final-analysis:${sessionUuid}"));
  assert.ok(actions.includes("text-to-speech:${sessionUuid}"));
  assert.match(actions, /export async function generateAudioAction[\\s\\S]*?if \(!sessionUuid\) throw new Error\("Not authenticated"\)/);
  assert.match(actions, /authoritativeSummary = topicDoc\.summary/);
  assert.match(actions, /question: textQuestions\[idx\]\.question/);
});

test("in-memory rate limiter enforces a hard cap on active key growth", () => {
  const limiter = fs.readFileSync("src/lib/rate-limiter.ts", "utf8");
  assert.match(limiter, /while \(hitMap\.size > MAX_KEYS\)/);
  assert.match(limiter, /hitMap\.delete\(oldestKey\)/);
});

test("account deletion does not silently succeed when dependent-record cleanup fails", () => {
  const deleteStart = auth.indexOf("export async function deleteAccountAction");
  const deleteAction = auth.slice(deleteStart);
  assert.match(deleteAction, /await Promise\.all\(\[/);
  assert.match(deleteAction, /await User\.deleteOne\(\{ uuid: sessionId \}\)/);
  assert.doesNotMatch(deleteAction, /Promise\.allSettled/);
});

test("topic progress persistence validates ownership, status, answer bounds, and request rate", () => {
  const actions = fs.readFileSync("src/app/actions.ts", "utf8");
  const start = actions.indexOf("export async function updateTopicProgressAction");
  const progress = actions.slice(start);
  assert.match(progress, /mongoose\.isValidObjectId\(topicId\)/);
  assert.match(progress, /status !== "in_progress" && status !== "completed"/);
  assert.ok(progress.includes("topic-progress:${sessionUuid}"));
  assert.match(progress, /\{ _id: topicId, userId: sessionUuid \}/);
});
