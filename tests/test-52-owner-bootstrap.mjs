import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("owner bootstrap is manual, identity-bound, and fail-closed", () => {
  const source = fs.readFileSync("scripts/bootstrap-owner.mjs", "utf8");
  assert.match(source, /OWNER_BOOTSTRAP_CONFIRM/);
  assert.match(source, /MONGODB_URI/);
  assert.match(source, /username !== OWNER_USERNAME \|\| email !== OWNER_EMAIL/);
  assert.match(source, /account\.role !== "user"/);
  assert.match(source, /\$set: \{ role: "owner" \}/);
  assert.match(source, /modifiedCount !== 1/);
  assert.match(source, /role=owner/);
  assert.doesNotMatch(source, /app\.post\(|NextResponse|export async function POST/);
});

test("owner bootstrap never promotes on ordinary login or registration", () => {
  const auth = fs.readFileSync("src/app/actions/auth.ts", "utf8");
  assert.match(auth, /This username and email are reserved for system administration/);
  assert.doesNotMatch(auth, /role:\s*["\x27]owner["\x27]/);
});
