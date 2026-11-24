import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("donation amount drives an INR UPI intent and QR code", () => {
  const page = fs.readFileSync("src/app/donate/page.tsx", "utf8");
  assert.match(page, /id="donation-amount"/);
  assert.match(page, /min="1"/);
  assert.match(page, /max="10000000"/);
  assert.match(page, /setDonationAmount\(e\.target\.value\)/);
  assert.match(page, /upi:\/\/pay\?pa=/);
  assert.match(page, /&am=\$\{parsedDonationAmount\.toFixed\(2\)\}/);
  assert.match(page, /&cu=INR/);
  assert.match(page, /create-qr-code/);
  assert.match(page, /href=\{upiPaymentUri\}/);
});

test("donor-entered amount is sent only as a claimed reference, never as verified amount", () => {
  const page = fs.readFileSync("src/app/donate/page.tsx", "utf8");
  const actions = fs.readFileSync("src/app/actions/donation.ts", "utf8");
  const admin = fs.readFileSync("src/components/admin/donation-reconciliation.tsx", "utf8");
  const submit = page.slice(page.indexOf("const result = await submitDonationTransaction"), page.indexOf("if (!result.success)"));
  assert.match(submit, /claimedAmount:\s*parsedDonationAmount/);
  assert.match(actions, /claimedAmount,\s*$/m);
  assert.match(actions, /claimedAmount:\s*t\.claimedAmount\s*\?\?\s*null/);
  assert.match(admin, /Donor-entered QR amount/);
  assert.match(admin, /View Public Donation Page/);
  assert.doesNotMatch(submit, /verifiedAmount\s*:/);
});
