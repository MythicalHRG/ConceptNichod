import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("account-deletion OTP attempts are atomically bounded and rate-limited", () => {
  const source = fs.readFileSync("src/app/actions/auth.ts", "utf8");
  const start = source.indexOf("export async function deleteAccountAction(");
  const end = source.indexOf("\nexport async function ", start + 1);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const action = source.slice(start, end);
  assert.match(action, /checkDistributedRateLimit\(`delete-account:verify:\$\{sessionId\}`, 5, 15 \* 60 \* 1000\)/);
  assert.match(action, /attempts: \{ \$lt: 5 \}/);
  assert.match(action, /\$inc: \{ attempts: 1 \}/);
  assert.doesNotMatch(action, /otpRecord\.attempts = \(otpRecord\.attempts \|\| 0\) \+ 1/);
  assert.doesNotMatch(action, /await otpRecord\.save\(\)/);
});
