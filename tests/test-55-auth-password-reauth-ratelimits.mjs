import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("remaining current-password verification actions have per-session distributed limits", () => {
  const source = fs.readFileSync("src/app/actions/auth.ts", "utf8");
  const emailStart = source.indexOf("export async function requestEmailChangeOtpAction(");
  const emailEnd = source.indexOf("\nexport async function confirmEmailChangeAction(", emailStart);
  const emailAction = source.slice(emailStart, emailEnd);
  assert.match(emailAction, /checkDistributedRateLimit\(`email-change:password:\$\{sessionUuid\}`, 5, 15 \* 60 \* 1000\)/);
  assert.match(emailAction, /comparePassword\(currentPassword, currentUser\.password\)/);

  const passwordStart = source.indexOf("export async function changePasswordAction(");
  const passwordEnd = source.indexOf("\nexport async function requestDeleteAccountOtpAction(", passwordStart);
  const passwordAction = source.slice(passwordStart, passwordEnd);
  assert.match(passwordAction, /checkDistributedRateLimit\(`password-change:verify:\$\{sessionId\}`, 5, 15 \* 60 \* 1000\)/);
  assert.match(passwordAction, /comparePassword\(currentPassword, user\.password\)/);

  const deleteStart = source.indexOf("export async function requestDeleteAccountOtpAction(");
  const deleteEnd = source.indexOf("\nexport async function deleteAccountAction(", deleteStart);
  const deleteAction = source.slice(deleteStart, deleteEnd);
  assert.match(deleteAction, /checkDistributedRateLimit\(`delete-account:password:\$\{sessionUuid\}`, 5, 15 \* 60 \* 1000\)/);
  assert.match(deleteAction, /comparePassword\(currentPassword, user\.password\)/);
});
