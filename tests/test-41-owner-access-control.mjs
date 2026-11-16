import assert from "node:assert/strict";
import test from "node:test";
import { hasPlatformOwnerIdentity, isPlatformOwner } from "../src/lib/owner-access";

test("only the designated Owner identity with Owner role is privileged", () => {
  assert.equal(isPlatformOwner({ username: "mythicalhrg", role: "owner" }), true);
  assert.equal(isPlatformOwner({ email: "mythicalhrg@gmail.com", role: "owner" }), true);
  assert.equal(isPlatformOwner({ username: "ordinary-user", role: "owner" }), false);
  assert.equal(isPlatformOwner({ username: "mythicalhrg", role: "user" }), false);
  assert.equal(isPlatformOwner({ username: "mythicalhrg", role: "admin" }), false);
  assert.equal(isPlatformOwner(null), false);
});

test("legacy Admin role is not silently upgraded to Owner", () => {
  assert.equal(isPlatformOwner({ username: "another-account", role: "admin" }), false);
});

test("identity matching is normalized without granting access by email alone", () => {
  assert.equal(hasPlatformOwnerIdentity({ username: " MythicalHRG " }), true);
  assert.equal(hasPlatformOwnerIdentity({ email: "MYTHICALHRG@GMAIL.COM" }), true);
  assert.equal(isPlatformOwner({ email: "MYTHICALHRG@GMAIL.COM", role: "user" }), false);
});
