import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("admin action authorization preserves the platform owner's stored role", () => {
  const adminSource = fs.readFileSync("src/app/actions/admin.ts", "utf8");
  const start = adminSource.indexOf("async function verifyAdmin()");
  const end = adminSource.indexOf("\n}\n", start);
  assert.notEqual(start, -1, "verifyAdmin must exist");
  assert.notEqual(end, -1, "verifyAdmin must have a function boundary");

  const verifyAdmin = adminSource.slice(start, end);
  assert.match(verifyAdmin, /user\.username !== ADMIN_USERNAME/);
  assert.match(verifyAdmin, /user\.email\?\.toLowerCase\(\) !== "mythicalhrg@gmail\.com"/);
  assert.doesNotMatch(verifyAdmin, /user\.role\s*=/);
  assert.doesNotMatch(verifyAdmin, /user\.save\s*\(/);
});

test("the user model continues to support the distinct owner role", () => {
  const userModel = fs.readFileSync("src/models/User.ts", "utf8");
  assert.match(userModel, /role:\s*"user"\s*\|\s*"admin"\s*\|\s*"owner"/);
  assert.match(userModel, /enum:\s*\["user",\s*"admin",\s*"owner"\]/);
});
