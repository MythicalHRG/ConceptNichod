import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("OTP attempt accounting is atomic and bounded in MongoDB", () => {
  const source = fs.readFileSync("src/app/api/auth/otp/route.ts", "utf8");
  assert.match(source, /findOneAndUpdate\(\s*\{ email, expiresAt: \{ \$gt: now \}, attempts: \{ \$lt: MAX_VERIFY_ATTEMPTS \} \},\s*\{ \$inc: \{ attempts: 1 \} \}/);
  assert.match(source, /isVerified: false, expiresAt: \{ \$gt: new Date\(\) \}/);
  const verifyBlock = source.slice(source.indexOf("if (action === 'verify')"), source.indexOf("return NextResponse.json({ error: 'Invalid action'"));
  assert.doesNotMatch(verifyBlock, /otpRecord\.attempts\s*=\s*\(otpRecord\.attempts\s*\|\|\s*0\)\s*\+\s*1/);
  assert.doesNotMatch(verifyBlock, /await otpRecord\.save\(\)/);
});

test("group deletion purges associated group messages", () => {
  const admin = fs.readFileSync("src/app/actions/admin.ts", "utf8");
  const groups = fs.readFileSync("src/app/actions/study-groups.ts", "utf8");
  assert.match(admin, /GroupMessage\.deleteMany\(\{ groupId \}\)/);
  assert.match(groups, /GroupMessage\.deleteMany\(\{ groupId \}\)/);
});

test("distributed rate limiter retries duplicate-key upsert races", () => {
  const source = fs.readFileSync("src/lib/distributed-rate-limiter.ts", "utf8");
  assert.match(source, /error\?\.code !== 11000/);
  assert.match(source, /\$inc: \{ count: 1 \}/);
});

test("leaderboard calculations guard zero denominators", () => {
  const source = fs.readFileSync("src/app/actions/leaderboard.ts", "utf8");
  assert.match(source, /N > 0 \? Math\.round\(\(totalScore \/ N\)/);
  assert.match(source, /if \(denominator !== 0\)/);
  assert.match(source, /N > 0 \? Math\.max\(0/);
});
