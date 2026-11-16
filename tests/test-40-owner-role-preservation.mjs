import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Owner action authorization preserves the platform owner's stored role", () => {
  const ownerSource = fs.readFileSync("src/app/actions/admin.ts", "utf8");
  const start = ownerSource.indexOf("async function verifyOwner()");
  const end = ownerSource.indexOf("\n}\n", start);
  assert.notEqual(start, -1, "verifyOwner must exist");
  assert.notEqual(end, -1, "verifyOwner must have a function boundary");
  const verifyOwner = ownerSource.slice(start, end);
  assert.match(verifyOwner, /isPlatformOwner\(user\)/);
  assert.doesNotMatch(verifyOwner, /user\.role\s*=/);
  assert.doesNotMatch(verifyOwner, /user\.save\s*\(/);
});

test("the User model supports only member and Owner roles", () => {
  const userModel = fs.readFileSync("src/models/User.ts", "utf8");
  assert.match(userModel, /role:\s*"user"\s*\|\s*"owner"/);
  assert.match(userModel, /enum:\s*\["user",\s*"owner"\]/);
});
