import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("Owner authorization requires both the owner role and designated identity", () => {
  const source = fs.readFileSync("src/lib/owner-access.ts", "utf8");
  assert.match(source, /user\.role === "owner"/);
  assert.match(source, /username === PLATFORM_OWNER_USERNAME \|\| email === PLATFORM_OWNER_EMAIL/);
  assert.doesNotMatch(source, /role\s*===\s*"admin"/);
});

test("legacy Admin role is denied rather than silently promoted", () => {
  const source = fs.readFileSync("src/lib/owner-access.ts", "utf8");
  assert.match(source, /user\.role === "owner"/);
  assert.doesNotMatch(source, /user\.role === "admin"/);
});

test("the User model no longer accepts Admin as a persisted role", () => {
  const source = fs.readFileSync("src/models/User.ts", "utf8");
  assert.match(source, /role: "user" \| "owner"/);
  assert.match(source, /enum: \["user", "owner"\]/);
  assert.doesNotMatch(source, /"user",\s*"admin",\s*"owner"/);
});
