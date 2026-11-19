import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Owner mutations protect the platform owner identity from deletion and bans", () => {
  const source = fs.readFileSync("src/app/actions/admin.ts", "utf8");
  assert.match(source, /const userToDelete = await User\.findOne\(\{ uuid \}\)\.select\("username email role"\)\.lean\(\)/);
  assert.match(source, /if \(isPlatformOwner\(userToDelete\)\)/);
  assert.match(source, /PLATFORM_OWNER_EMAIL/);
  assert.match(source, /Cannot ban the platform owner account or its current IP address/);
  assert.match(source, /targetMatcher/);
});

test("email broadcasts reject header injection, malformed recipients, and oversized recipient lists", () => {
  const source = fs.readFileSync("src/app/actions/email-broadcast.ts", "utf8");
  assert.match(source, /subject\.length > 180 \|\| \/\[\\r\\n\]\//);
  assert.match(source, /body\.length > 20000/);
  assert.match(source, /maxToRecipients = recipientType === "all" \? 5000 : 500/);
  assert.match(source, /ccRecipients\.length > 50 \|\| bccRecipients\.length > 50/);
  assert.match(source, /escapeHtml\(body\)/);
  assert.match(source, /href="\$\{escapeHtml\(attachmentUrl\)\}"/);
  assert.match(source, /parsedUrl\.protocol !== "https:" \|\| !isAllowedHost \|\| parsedUrl\.username \|\| parsedUrl\.password/);
});

test("all exported admin broadcast actions retain server-side Owner authorization", () => {
  const admin = fs.readFileSync("src/app/actions/admin.ts", "utf8");
  for (const action of ["getAllUsersAction", "deleteUserAction", "banEntityAction", "unbanEntityAction", "getBansAction", "updateUserCredentialsAction", "getAllStudyGroupsAdminAction", "deleteStudyGroupAdminAction"]) {
    const start = admin.indexOf(`export async function ${action}(`);
    assert.notEqual(start, -1, `${action} exists`);
    const next = admin.indexOf("\nexport async function ", start + 1);
    const block = admin.slice(start, next < 0 ? undefined : next);
    assert.match(block, /verifyOwner\(\)/, `${action} must call verifyOwner`);
  }
  const email = fs.readFileSync("src/app/actions/email-broadcast.ts", "utf8");
  assert.match(email, /export async function sendEmailBroadcastAction\(formData: FormData\) \{\s*await verifyOwner\(\)/);
  assert.match(email, /export async function getEmailBroadcastsAction\(\) \{\s*await verifyOwner\(\)/);
  const broadcasts = fs.readFileSync("src/app/actions/broadcast.ts", "utf8");
  for (const action of ["createBroadcastAction", "deleteBroadcastAction"]) {
    const start = broadcasts.indexOf(`export async function ${action}(`);
    const next = broadcasts.indexOf("\nexport async function ", start + 1);
    const block = broadcasts.slice(start, next < 0 ? undefined : next);
    assert.match(block, /verifyOwner\(\)/);
  }
});
