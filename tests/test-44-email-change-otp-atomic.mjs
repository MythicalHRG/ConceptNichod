import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("email-change OTP confirmation atomically bounds guesses and rate-limits the session", () => {
  const source = fs.readFileSync("src/app/actions/auth.ts", "utf8");
  const start = source.indexOf("export async function confirmEmailChangeAction(");
  const end = source.indexOf("\nexport async function resetPasswordAction(", start);
  assert.notEqual(start, -1, "email-change confirmation action must exist");
  assert.notEqual(end, -1, "email-change confirmation action must have a bounded source region");
  const action = source.slice(start, end);
  assert.match(action, /checkDistributedRateLimit\(`email-change:verify:\$\{sessionUuid\}:\$\{email\}`, 5, 15 \* 60 \* 1000\)/);
  assert.match(action, /attempts: \{ \$lt: 5 \}/);
  assert.match(action, /\$inc: \{ attempts: 1 \}/);
  assert.match(action, /findOneAndUpdate\(/);
  assert.doesNotMatch(action, /otpRecord\.attempts = \(otpRecord\.attempts \|\| 0\) \+ 1/);
  assert.doesNotMatch(action, /await otpRecord\.save\(\)/);
});
