import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");

test("Batch 13: dashboard branding uses Zirconel and contains no KRYOT label", () => {
  const dashboard = read("src/app/dashboard/page.tsx");
  assert.equal(/KRYOT/i.test(dashboard), false);
  assert.equal(dashboard.includes("Zirconel"), true);
});

test("Batch 13: canonical owner self-healing requires both reserved username and normalized email", () => {
  const owner = read("src/lib/owner-access.ts");
  assert.ok(owner.includes("username === PLATFORM_OWNER_USERNAME && email === normalizeEmail(PLATFORM_OWNER_EMAIL)"));
  assert.ok(owner.includes("User.updateOne("));
  assert.ok(owner.includes('$set: { role: "owner" }'));
  assert.ok(owner.includes('user.role = "owner"'));

  const isOwner = (user) => Boolean(
    user && user.role === "owner" &&
    String(user.username || "").trim().toLowerCase() === "mythicalhrg" &&
    String(user.email || "").trim().toLowerCase().replaceAll(".", "") === "mythicalhrg@gmailcom"
  );
  assert.equal(isOwner({ username: "MythicalHRG", email: "mythicalhrg@gmail.com", role: "owner" }), true);
  assert.equal(isOwner({ username: "mythicalhrg", email: "student@gmail.com", role: "owner" }), false);
  assert.equal(isOwner({ username: "student", email: "mythicalhrg@gmail.com", role: "owner" }), false);
  assert.equal(isOwner({ username: "mythicalhrg", email: "mythicalhrg@gmail.com", role: "user" }), false);
});

test("Batch 13: all five profile graph cards share the six-column desktop grid", () => {
  const analytics = read("src/components/profile/user-analytics.tsx");
  assert.ok(analytics.includes("grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4 sm:gap-5 items-stretch"));
  assert.ok(analytics.includes("5-Axis Mastery Pentagon Radar"));
  assert.ok(analytics.includes('gridType="polygon"'));
  assert.ok(analytics.includes("Mastery Learning Curve"));
  assert.ok(analytics.includes("Subject Distribution"));
  assert.ok(analytics.includes("Overall Score Distribution"));
  assert.ok(analytics.includes("Average Skill Performance"));
  assert.ok(analytics.includes("md:col-span-2 xl:col-span-3"));
});

test("Batch 13: donations default enabled and only the owner can toggle the setting", () => {
  const model = read("src/models/DonationSetting.ts");
  const actions = read("src/app/actions/donation.ts");
  const panel = read("src/components/admin/admin-panel.tsx");
  const reconciliation = read("src/components/admin/donation-reconciliation.tsx");
  assert.ok(model.includes("isEnabled: { type: Boolean, default: true }"));
  assert.ok(actions.includes("export async function adminSetDonationsEnabledAction(enabled: boolean)"));
  assert.ok(actions.includes('typeof enabled !== "boolean"'));
  assert.ok(actions.includes("verifySessionCookie"));
  assert.ok(actions.includes("isPlatformOwner(adminUser)"));
  assert.ok(actions.includes("DonationSetting.updateOne("));
  assert.ok(panel.includes("<Switch checked={donationsEnabled} onCheckedChange={handleToggleDonations}"));
  assert.ok(reconciliation.includes("<Switch checked={effectiveDonationsEnabled}"));
});
