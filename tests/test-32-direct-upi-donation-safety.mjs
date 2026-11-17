import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("obsolete automated payment gateways are absent", () => {
  for (const file of [
    "src/lib/mystic-payments.ts",
    "src/lib/youpi.ts",
    "src/app/api/webhooks/mystic-payments/route.ts",
    "src/app/api/webhooks/youpi/route.ts",
    "tests/test-31-mystic-payments-integration.mjs",
    "tests/test-32-automated-donation-flow.mjs",
    "tests/test-33-payment-url-sanitization-and-audit.mjs",
  ]) assert.equal(fs.existsSync(path.join(root, file)), false, file + " must be removed");
});

test("donation schemas retain UUID strings and support manual verification", () => {
  const tx = read("src/models/DonationTransaction.ts");
  const donor = read("src/models/Donor.ts");
  assert.match(tx, /userId:\s*\{\s*type:\s*String/, "userId must remain UUID-compatible");
  assert.match(tx, /utr:\s*\{[\s\S]*?unique:\s*true/, "UTR must be unique");
  assert.match(tx, /transactionId:\s*\{[\s\S]*?sparse:\s*true/, "Transaction ID index must be sparse for legacy rows");
  assert.match(tx, /verifiedAmount:\s*\{[\s\S]*?default:\s*null/, "verifiedAmount must start null");
  assert.match(tx, /isPublishedToPatrons/, "transaction must track explicit publication");
  assert.match(donor, /userId:\s*\{\s*type:\s*String/, "Donor userId must remain a string");
  assert.match(donor, /isVisible/, "Donor must support Hall of Patrons visibility");
  assert.match(donor, /totalAmount/, "legacy donor totals must remain available");
});

test("validation covers donor name, 12-digit UTR, Transaction ID and admin amount", () => {
  const validation = read("src/lib/donation-validation.ts");
  assert.match(validation, /validateUtr/);
  assert.match(validation, /validateTransactionId/);
  assert.match(validation, /validateDonationSubmission/);
  assert.match(validation, /validateAdminVerifiedAmount/);
  assert.match(validation, /\^\\d\{12\}\$/);
  assert.match(validation, /A-Z0-9_-/);
});

test("public donation form has no donor-entered amount and submits both references", () => {
  const page = read("src/app/donate/page.tsx");
  assert.match(page, /donorName/);
  assert.match(page, /transactionId/);
  assert.match(page, /submitDonationTransaction/);
  assert.match(page, /qr\.png/);
  assert.doesNotMatch(page, /name=["']amount["']/);
});

test("server actions keep legacy exports and enforce pending-first admin workflow", () => {
  const actions = read("src/app/actions/donation.ts");
  for (const name of [
    "submitDonationTransaction", "adminVerifyDonationAndSetAmount",
    "adminToggleHallOfPatrons", "adminRejectDonationTransaction",
    "adminUpdatePatron", "adminRemovePatron", "submitDonationUtrAction",
    "getPendingDonationsAdminAction", "updateDonationSettingsAction",
  ]) assert.match(actions, new RegExp("export async function " + name));
  assert.match(actions, /checkDistributedRateLimit/);
  assert.match(actions, /verifiedAmount:\s*null/);
  assert.match(actions, /isPublishedToPatrons:\s*false/);
});

test("admin reconciliation is accessible from both dashboard routes", () => {
  assert.match(read("src/components/admin/donation-reconciliation.tsx"), /Hall of Patrons Manager/);
  assert.match(read("src/components/admin/admin-panel.tsx"), /DonationReconciliation/);
  assert.match(read("src/app/dashboard/admin/donations/page.tsx"), /DonationReconciliation/);
});

test("admin verification requires bank statement UTR and recipient VPA evidence", () => {
  const actions = read("src/app/actions/donation.ts");
  const model = read("src/models/DonationTransaction.ts");
  const adminUi = read("src/components/admin/donation-reconciliation.tsx");
  assert.match(actions, /bankReference: string/);
  assert.match(actions, /bank statement reference must exactly match the submitted UTR/i);
  assert.match(actions, /recipientVpa !== configuredVpa/);
  assert.match(actions, /verificationMethod:\s*"manual-bank-reconciliation"/);
  assert.match(model, /bankReference:/);
  assert.match(adminUi, /Bank Statement UTR \/ Reference/);
  assert.match(adminUi, /Recipient VPA in Bank Record/);
});

test("legacy donation records without a status remain in the pending review queue", () => {
  const actions = read("src/app/actions/donation.ts");
  assert.match(actions, /status: \{ \$exists: false \}/);
  assert.match(actions, /status:\s*\(?t\.status\s*\|\|\s*"pending"\)?/);
  assert.match(actions, /legacyPendingCount/);
});

test("public donation totals are not truncated by the visible patron list limit", () => {
  const actions = read("src/app/actions/donation.ts");
  assert.match(actions, /Donor\.aggregate\(\[/);
  assert.match(actions, /totalRaised: \{ \$sum: "\$amount" \}/);
  assert.match(actions, /Number\(totalRaisedAgg\[0\]\?\.totalRaised \|\| 0\)/);
});

test("linked verified donation amounts cannot be edited outside reconciliation", () => {
  const actions = read("src/app/actions/donation.ts");
  assert.match(actions, /linkedTransaction\.status !== "verified"/);
  assert.match(actions, /linkedTransaction\.verifiedAmount\) !== amount\.data/);
});
