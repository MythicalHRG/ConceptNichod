import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(path.resolve(file), "utf8");

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : [file];
  }).filter((file) => /\.(?:ts|tsx|js|jsx)$/.test(file));
}

test("61.1 DONATIONS_ENABLED is absent from all production source", () => {
  const matches = sourceFiles("src").filter((file) => read(file).includes("DONATIONS_ENABLED"));
  assert.deepEqual(matches, []);
});

test("61.2 public and admin donation readers always return enabled status", () => {
  const actions = read("src/app/actions/donation.ts");
  const publicReader = actions.slice(actions.indexOf("export async function getPublicDonationPageData"), actions.indexOf("export async function submitDonationTransaction"));
  const adminReader = actions.slice(actions.indexOf("export async function getAdminDonationDashboard"), actions.indexOf("export async function adminVerifyDonationAndSetAmount"));
  const settingsReader = actions.slice(actions.indexOf("export async function getAdminDonationSettingsAction"), actions.indexOf("export async function adminSetDonationsEnabledAction"));
  assert.match(publicReader, /isEnabled: true/);
  assert.match(adminReader, /isEnabled: true/);
  assert.match(settingsReader, /isEnabled: true/);
  assert.doesNotMatch(actions, /Donations are currently paused|Donations are disabled/);
});

test("61.3 canonical settings prefer valid configured VPA and heal every disabled legacy row", () => {
  const actions = read("src/app/actions/donation.ts");
  assert.ok(actions.includes('DonationSetting.find({}).sort({ updatedAt: -1, _id: -1 })'));
  assert.ok(actions.includes('records.find((record: any) => Boolean(normalizeVpa(record.upiId || "")))'));
  assert.ok(actions.includes('isEnabled: { $ne: true }'));
  assert.ok(actions.includes('await DonationSetting.updateMany({}, { $set: update })'));
});

test("61.4 Indian phone and dotted VPAs are accepted while placeholders and unsafe strings are rejected", () => {
  const validation = read("src/lib/donation-validation.ts");
  assert.ok(validation.includes('^[a-zA-Z0-9._-]{2,64}@[a-zA-Z0-9.-]{2,64}$'));
  assert.ok(validation.includes('example|yourname|test|placeholder'));
  const valid = (v) => /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z0-9.-]{2,64}$/.test(v) && !v.includes("..");
  for (const vpa of ["9876543210@ybl", "harsh.raj@okicici", "9876543210@okaxis", "9876543210@oksbi", "9876543210@paytm", "9876543210@upi", "harsh.raj@okhdfcbank", "harsh.raj@ibl", "harsh.raj@axl", "harsh.raj@ptyes", "harsh.raj@ptaxis"]) assert.equal(valid(vpa), true, vpa);
  for (const vpa of ["", "example@upi", "yourname@upi", "test@upi", "placeholder@upi", "bad value@ybl", "https://x@ybl", "<script>@upi"]) assert.equal(valid(vpa) && !/example|yourname|test|placeholder/i.test(vpa), false, vpa);
});

test("61.5 donation steps remain visible and no UI can pause donations", () => {
  for (const file of ["src/app/donate/page.tsx", "src/components/admin/admin-panel.tsx", "src/components/admin/donation-reconciliation.tsx"]) {
    const source = read(file);
    assert.doesNotMatch(source, /DISABLED \(PAUSED\)|Donations are temporarily paused|Donations Temporarily Unavailable/);
  }
  const page = read("src/app/donate/page.tsx");
  assert.ok(page.includes("Step 1 • Pay via Official UPI ID"));
  assert.ok(page.includes("Step 2 • Send UTR & Transaction ID to Admin Panel"));
  assert.ok(page.includes("disabled={submitting || !receiverUpiId}"));
  assert.ok(page.includes("Official UPI ID not configured yet — configure it in Admin Panel"));
  assert.ok(read("src/app/actions/donation.ts").includes("noStore();"));
  assert.ok(read("src/components/admin/admin-panel.tsx").includes("Donations: Permanently Enabled"));
  assert.ok(read("src/components/admin/donation-reconciliation.tsx").includes("Donations: Permanently Enabled"));
});

test("61.6 owner authorization, anti-abuse, UTR and atomic bank verification guards remain", () => {
  const actions = read("src/app/actions/donation.ts");
  assert.ok(actions.includes("ensurePlatformOwnerRole"));
  assert.ok(actions.includes("isPlatformOwner(adminUser)"));
  assert.ok(actions.includes("checkDistributedRateLimit"));
  assert.ok(actions.includes("honeypot"));
  assert.ok(actions.includes("validateDonationSubmission"));
  assert.ok(actions.includes("bankReference"));
  assert.ok(actions.includes("recipientVpa !== configuredVpa"));
  assert.ok(actions.includes('status: "pending"'));
});
