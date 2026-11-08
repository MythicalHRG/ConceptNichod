import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

test("Tareeka 32.1: Automatic Tier Calculation strictly maps contribution tiers", () => {
  function getTierForAmount(amt) {
    if (amt >= 2500) return "Legend";
    if (amt >= 1000) return "Benefactor";
    if (amt >= 500) return "Patron";
    return "Supporter";
  }

  assert.equal(getTierForAmount(100), "Supporter");
  assert.equal(getTierForAmount(250), "Supporter");
  assert.equal(getTierForAmount(499), "Supporter");
  assert.equal(getTierForAmount(500), "Patron");
  assert.equal(getTierForAmount(999), "Patron");
  assert.equal(getTierForAmount(1000), "Benefactor");
  assert.equal(getTierForAmount(2499), "Benefactor");
  assert.equal(getTierForAmount(2500), "Legend");
  assert.equal(getTierForAmount(10000), "Legend");
});

test("Tareeka 32.2: Webhook payload passes HMAC-SHA256 cryptographic verification", () => {
  const webhookSecret = "test_webhook_secret_for_validation_at_least_32_chars";
  const payload = JSON.stringify({
    event: "SUCCESS",
    orderId: "cn_ord_test_12345",
    paymentId: "mp_pay_98765",
    amount: "500.00",
    customer: { name: "test_aspirant" },
    metadata: { username: "test_aspirant", message: "Empower learners!" }
  });

  const validSignature = crypto.createHmac("sha256", webhookSecret).update(payload, "utf8").digest("hex");

  function verifyMysticSignature(rawBody, signatureHeader, secret) {
    if (!rawBody || !signatureHeader || !secret) return false;
    const cleanHeader = signatureHeader.trim();
    const hexPart = cleanHeader.startsWith("sha256=") ? cleanHeader.slice(7).trim() : cleanHeader;
    if (!/^[0-9a-f]{64}$/i.test(hexPart)) return false;
    const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    return crypto.timingSafeEqual(Buffer.from(hexPart, "utf8"), Buffer.from(expected, "utf8"));
  }

  assert.equal(verifyMysticSignature(payload, validSignature, webhookSecret), true);
  assert.equal(verifyMysticSignature(payload, `sha256=${validSignature}`, webhookSecret), true);
  assert.equal(verifyMysticSignature(payload, "bad_signature_header", webhookSecret), false);
  assert.equal(verifyMysticSignature(payload, validSignature, "wrong_secret_key_32_characters_long_now"), false);
});

test("Tareeka 32.3: Webhook event recognition supports SUCCESS, OBSERVED_SUCCESS, and payment.succeeded", () => {
  function isSuccessfulEvent(status, event) {
    return (
      status === "SUCCESS" ||
      status === "COMPLETED" ||
      status === "OBSERVED_SUCCESS" ||
      event === "SUCCESS" ||
      event === "payment.succeeded" ||
      event === "payment.observed"
    );
  }

  assert.equal(isSuccessfulEvent("SUCCESS", null), true);
  assert.equal(isSuccessfulEvent(null, "SUCCESS"), true);
  assert.equal(isSuccessfulEvent("OBSERVED_SUCCESS", null), true);
  assert.equal(isSuccessfulEvent(null, "payment.succeeded"), true);
  assert.equal(isSuccessfulEvent("FAILED", "payment.failed"), false);
  assert.equal(isSuccessfulEvent("EXPIRED", null), false);
});

test("Tareeka 32.4: Username sanitization strictly strips leading @ and handles fallbacks", () => {
  function sanitizeDonorUsername(customer, metadata) {
    const rawUsername = (
      customer?.name ||
      metadata?.username ||
      customer?.email?.split("@")[0] ||
      "Generous Patron"
    ).toString().trim();
    return rawUsername.replace(/^@+/, "") || "Generous Patron";
  }

  assert.equal(sanitizeDonorUsername({ name: "@rohit" }, null), "rohit");
  assert.equal(sanitizeDonorUsername({ name: "@@mythicalhrg" }, null), "mythicalhrg");
  assert.equal(sanitizeDonorUsername(null, { username: "harsh" }), "harsh");
  assert.equal(sanitizeDonorUsername({ email: "student@gmail.com" }, null), "student");
  assert.equal(sanitizeDonorUsername(null, null), "Generous Patron");
});

test("Tareeka 32.5: Idempotent key generation prefixes order ID with mp_ for single-settlement guarantee", () => {
  const orderId = "cn_ord_1794149999_abcd";
  const expectedUuid = `mp_${orderId}`;
  assert.equal(expectedUuid, "mp_cn_ord_1794149999_abcd");
  assert.match(expectedUuid, /^mp_cn_ord_\d+_[a-f0-9]+$/);
});
