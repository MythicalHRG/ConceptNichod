import test from "node:test";
import assert from "node:assert/strict";
import {
  parseDonationAmount,
  normalizeUpiReference,
  normalizeVpa,
  isExactDonationMatch,
} from "../src/lib/donation-validation.ts";

test("donation amounts reject invalid, fractional precision, and unreasonable claims", () => {
  assert.equal(parseDonationAmount(1), 1);
  assert.equal(parseDonationAmount(12.5), 12.5);
  assert.equal(parseDonationAmount(12.34), 12.34);
  assert.equal(parseDonationAmount(12.01), 12.01);
  assert.equal(parseDonationAmount(1.15), 1.15);
  assert.equal(parseDonationAmount(12.345), null);
  assert.equal(parseDonationAmount(0), null);
  assert.equal(parseDonationAmount(-1), null);
  assert.equal(parseDonationAmount("NaN"), null);
  assert.equal(parseDonationAmount(1000001), null);
});

test("UPI references normalize case and accept bank-specific 8-20 alphanumeric references", () => {
  assert.equal(normalizeUpiReference(" ab12cd34 "), "AB12CD34");
  assert.equal(normalizeUpiReference("12345678901234567890"), "12345678901234567890");
  assert.equal(normalizeUpiReference("short"), null);
  assert.equal(normalizeUpiReference("bad-reference!"), null);
  assert.equal(normalizeUpiReference(""), null);
});

test("VPA validation normalizes case and rejects malformed values", () => {
  assert.equal(normalizeVpa("Harsh.2525@PTAXIS"), "harsh.2525@ptaxis");
  assert.equal(normalizeVpa("not-a-vpa"), null);
  assert.equal(normalizeVpa("@bank"), null);
});

test("bank reconciliation requires exact amount and configured recipient match", () => {
  assert.equal(isExactDonationMatch(500, 500, "person@bank", "PERSON@BANK"), true);
  assert.equal(isExactDonationMatch(500, 499, "person@bank", "person@bank"), false);
  assert.equal(isExactDonationMatch(500, 500, "person@bank", "other@bank"), false);
});
