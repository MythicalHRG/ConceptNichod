import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("email-change OTP requests require server-side password reauthentication", () => {
  const source = fs.readFileSync("src/app/actions/auth.ts", "utf8");
  const start = source.indexOf("export async function requestEmailChangeOtpAction(");
  const end = source.indexOf("\nexport async function confirmEmailChangeAction(", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const action = source.slice(start, end);
  assert.match(action, /currentPassword: string/);
  assert.match(action, /if \(typeof currentPassword !== "string" \|\| !currentPassword\)/);
  assert.match(action, /comparePassword\(currentPassword, currentUser\.password\)/);
  assert.doesNotMatch(action, /if \(currentPassword\)\s*\{/);
});
