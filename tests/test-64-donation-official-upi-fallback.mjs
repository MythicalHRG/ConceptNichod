import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("owner-provided UPI ID is the fallback across public payment and submission flows", () => {
  const action = fs.readFileSync("src/app/actions/donation.ts", "utf8");
  assert.match(action, /DEFAULT_DONATION_UPI_ID = "harsh\.2525@ptaxis"/);
  assert.match(action, /upiId: configuredVpa \|\| DEFAULT_DONATION_UPI_ID/);
  assert.match(action, /normalizeVpa\(\(settings as any\)\?\.upiId \|\| DEFAULT_DONATION_UPI_ID\)/);
  assert.match(action, /upiId: DEFAULT_DONATION_UPI_ID/);
  const reader = action.slice(action.indexOf("async function getCanonicalDonationSettings"), action.indexOf("async function saveCanonicalDonationSettings"));
  assert.doesNotMatch(reader, /updateMany|findByIdAndUpdate|create\(/);
});
