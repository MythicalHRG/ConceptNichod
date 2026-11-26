import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");

test("Batch 13: dashboard branding uses ConceptNichod and contains no KRYOT label", () => {
  const dashboard = read("src/app/dashboard/page.tsx");
  assert.equal(/KRYOT/i.test(dashboard), false);
  assert.equal(dashboard.includes("ConceptNichod"), true);
});

test("Batch 13: canonical owner self-healing requires both reserved username and normalized email", () => {
  const owner = read("src/lib/owner-access.ts");
  const sidebar = read("src/components/dashboard/sidebar-nav.tsx");
  const bottomNav = read("src/components/dashboard/bottom-nav.tsx");
  assert.ok(owner.includes("username === PLATFORM_OWNER_USERNAME && email === normalizeEmail(PLATFORM_OWNER_EMAIL)"));
  assert.ok(owner.includes("User.updateOne("));
  assert.ok(owner.includes('$set: { role: "owner" }'));
  assert.ok(owner.includes('user.role = "owner"'));
  assert.ok(sidebar.includes('if (isAdmin)'));
  assert.ok(sidebar.includes('href: "/dashboard/admin"'));
  assert.ok(bottomNav.includes("setOpenMobile(true)"));

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
  assert.ok(analytics.includes("grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4"));
  assert.ok(analytics.includes("grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4 sm:gap-5 items-stretch"));
  assert.ok(analytics.includes("min-h-[260px] sm:min-h-[280px]"));
  assert.ok(analytics.includes('ChartContainer config={chartConfig} className="w-full h-[250px]"'));
  assert.ok(analytics.includes("5-Axis Mastery Pentagon Radar"));
  assert.ok(analytics.includes('gridType="polygon"'));
  assert.ok(analytics.includes("Mastery Learning Curve"));
  assert.ok(analytics.includes("Subject Distribution"));
  assert.ok(analytics.includes("Overall Score Distribution"));
  assert.ok(analytics.includes("Average Skill Performance"));
  assert.ok(analytics.includes("md:col-span-2 xl:col-span-3"));
});

test("Batch 13: donations are permanently enabled and owner settings remain protected", () => {
  const model = read("src/models/DonationSetting.ts");
  const actions = read("src/app/actions/donation.ts");
  const panel = read("src/components/admin/admin-panel.tsx");
  const reconciliation = read("src/components/admin/donation-reconciliation.tsx");
  assert.ok(model.includes("isEnabled: { type: Boolean, default: true }"));
  assert.ok(actions.includes("export async function adminSetDonationsEnabledAction(enabled: boolean)"));
  assert.ok(actions.includes('typeof enabled !== "boolean"'));
  assert.ok(actions.includes("getVerifiedSessionUuid"));
  assert.ok(actions.includes("isPlatformOwner(adminUser)"));
  assert.ok(actions.includes("getCanonicalDonationSettings"));
  assert.ok(actions.includes("isEnabled: true"));
  assert.ok(!panel.includes("DISABLED (PAUSED)") && !panel.includes("handleToggleDonations") && !panel.includes("adminSetDonationsEnabledAction"));
  assert.ok(!panel.includes("<Switch checked={donationsEnabled}"));
  assert.ok(!reconciliation.includes("DISABLED (PAUSED)") && !reconciliation.includes("handleToggleDonations") && !reconciliation.includes("adminSetDonationsEnabledAction"));
  assert.ok(!reconciliation.includes("<Switch checked={effectiveDonationsEnabled}"));
});
