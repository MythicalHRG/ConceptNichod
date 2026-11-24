import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("shared Rupee component renders the real INR glyph and consistently formats values", () => {
  const source = fs.readFileSync("src/components/ui/rupee-symbol.tsx", "utf8");
  assert.match(source, /₹/);
  assert.match(source, /font-rupee/);
  assert.match(source, /new Intl\.NumberFormat\("en-IN"/);
  assert.doesNotMatch(source, /lucide-react|IndianRupee/);
  assert.match(source, /formatINR\(amount\)/);
});

test("donation UI routes every displayed amount through the shared INR component", () => {
  const page = fs.readFileSync("src/app/donate/page.tsx", "utf8");
  const admin = fs.readFileSync("src/components/admin/donation-reconciliation.tsx", "utf8");
  assert.match(page, /import \{ Rupee, formatINR \}/);
  assert.match(page, /<Rupee amount=\{parsedDonationAmount\}/);
  assert.match(page, /<Rupee amount=\{totalRaised\}/);
  assert.match(page, /<Rupee amount=\{patron\.amount\}/);
  assert.match(admin, /<Rupee amount=\{summary\.totalVerifiedAmount\}/);
  assert.doesNotMatch(page, /₹/);
  assert.doesNotMatch(admin, /₹/);
});

test("user-facing donation validation and verification messages use INR wording", () => {
  for (const file of ["src/app/actions/donation.ts", "src/lib/donation-validation.ts", "src/models/Donor.ts"]) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /₹/);
  }
});
