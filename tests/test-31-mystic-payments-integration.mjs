import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  getStrictMysticConfig,
  verifyMysticSignature,
  StrictCredentialError,
  createMysticSession,
} from '../src/lib/mystic-payments.ts';

test('Tareeka 31.1: StrictCredentialError thrown in production when credentials are missing or malformed', () => {
  const originalEnv = { ...process.env };

  try {
    process.env.NODE_ENV = 'production';
    delete process.env.MYSTIC_PAYMENTS_MERCHANT_ID;
    delete process.env.YOUPI_MERCHANT_ID;

    assert.throws(
      () => getStrictMysticConfig(),
      /Missing MYSTIC_PAYMENTS_MERCHANT_ID/i
    );

    // Invalid UUID format
    process.env.MYSTIC_PAYMENTS_MERCHANT_ID = 'invalid-uuid-format';
    assert.throws(
      () => getStrictMysticConfig(),
      /must be a valid UUID format/i
    );

    // Valid UUID, but missing API key
    process.env.MYSTIC_PAYMENTS_MERCHANT_ID = 'd68333a5-27a3-482e-bf85-db3905ffacd9';
    delete process.env.MYSTIC_PAYMENTS_API_KEY;
    delete process.env.YOUPI_API_KEY;
    assert.throws(
      () => getStrictMysticConfig(),
      /Missing MYSTIC_PAYMENTS_API_KEY/i
    );

    // Short API key (<24 chars)
    process.env.MYSTIC_PAYMENTS_API_KEY = 'short_key';
    assert.throws(
      () => getStrictMysticConfig(),
      /length complexity bounds/i
    );

    // Valid API key, but missing webhook secret
    process.env.MYSTIC_PAYMENTS_API_KEY = 'yp_live_44a4687a407e6ac446bfc5f244417dea';
    delete process.env.MYSTIC_PAYMENTS_WEBHOOK_SECRET;
    delete process.env.YOUPI_WEBHOOK_SECRET;
    assert.throws(
      () => getStrictMysticConfig(),
      /Missing MYSTIC_PAYMENTS_WEBHOOK_SECRET/i
    );

    // Short webhook secret (<32 chars)
    process.env.MYSTIC_PAYMENTS_WEBHOOK_SECRET = 'short_secret';
    assert.throws(
      () => getStrictMysticConfig(),
      /must be at least 32 characters/i
    );

    // Valid secret, but missing API URL
    process.env.MYSTIC_PAYMENTS_WEBHOOK_SECRET = '99d47c187e8184c3919f792e792362b1bf886dadee3636b288a9d26fd7fab703';
    delete process.env.MYSTIC_PAYMENTS_API_URL;
    delete process.env.YOUPI_API_URL;
    assert.throws(
      () => getStrictMysticConfig(),
      /Missing MYSTIC_PAYMENTS_API_URL/i
    );
  } finally {
    process.env = originalEnv;
  }
});

test('Tareeka 31.2: Valid MysticPayments credentials parsed cleanly in strict config', () => {
  const originalEnv = { ...process.env };

  try {
    process.env.NODE_ENV = 'production';
    process.env.MYSTIC_PAYMENTS_MERCHANT_ID = 'd68333a5-27a3-482e-bf85-db3905ffacd9';
    process.env.MYSTIC_PAYMENTS_API_KEY = 'yp_live_44a4687a407e6ac446bfc5f244417dea';
    process.env.MYSTIC_PAYMENTS_WEBHOOK_SECRET = '99d47c187e8184c3919f792e792362b1bf886dadee3636b288a9d26fd7fab703';
    process.env.MYSTIC_PAYMENTS_API_URL = 'https://payments.example.com';
    process.env.MYSTIC_PAYMENTS_GATEWAY_URL = 'https://checkout.example.com';

    const config = getStrictMysticConfig();
    assert.equal(config.merchantId, 'd68333a5-27a3-482e-bf85-db3905ffacd9');
    assert.equal(config.apiKey, 'yp_live_44a4687a407e6ac446bfc5f244417dea');
    assert.equal(config.webhookSecret, '99d47c187e8184c3919f792e792362b1bf886dadee3636b288a9d26fd7fab703');
    assert.equal(config.apiUrl, 'https://payments.example.com');
    assert.equal(config.gatewayUrl, 'https://checkout.example.com');
  } finally {
    process.env = originalEnv;
  }
});

test('Tareeka 31.3: Authoritative HMAC-SHA256 signature verification protects against tampering', () => {
  const secret = '99d47c187e8184c3919f792e792362b1bf886dadee3636b288a9d26fd7fab703';
  const body = JSON.stringify({
    event: 'payment.succeeded',
    orderId: 'cn_ord_12345',
    amount: '500.00',
    status: 'SUCCESS',
  });

  const validHmac = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');

  // Valid with sha256= prefix
  assert.equal(verifyMysticSignature(body, `sha256=${validHmac}`, secret), true);

  // Valid raw hex
  assert.equal(verifyMysticSignature(body, validHmac, secret), true);

  // Tampered payload
  const tamperedBody = JSON.stringify({
    event: 'payment.succeeded',
    orderId: 'cn_ord_12345',
    amount: '50000.00',
    status: 'SUCCESS',
  });
  assert.equal(verifyMysticSignature(tamperedBody, `sha256=${validHmac}`, secret), false);

  // Wrong secret
  assert.equal(verifyMysticSignature(body, `sha256=${validHmac}`, 'wrong_secret_12345678901234567890123456'), false);

  // Malformed header strings
  assert.equal(verifyMysticSignature(body, 'short_signature', secret), false);
  assert.equal(verifyMysticSignature(body, null, secret), false);
  assert.equal(verifyMysticSignature('', `sha256=${validHmac}`, secret), false);
});

test('Tareeka 31.4: createMysticSession enforces positive amount bounds and required options', async () => {
  await assert.rejects(
    async () => {
      // @ts-ignore
      await createMysticSession(null);
    },
    /options object is required/i
  );

  await assert.rejects(
    async () => {
      await createMysticSession({
        orderId: '',
        amount: 100,
      });
    },
    /valid orderId string is required/i
  );

  await assert.rejects(
    async () => {
      await createMysticSession({
        orderId: 'order_test_1',
        amount: -50,
      });
    },
    /amount must be a positive number/i
  );

  await assert.rejects(
    async () => {
      await createMysticSession({
        orderId: 'order_test_1',
        amount: 0,
      });
    },
    /amount must be a positive number/i
  );
});

test('Tareeka 31.5: Backward-compatibility aliases in youpi.ts match MysticPayments exports', () => {
  const projectRoot = process.cwd();
  const youpiContent = fs.readFileSync(path.join(projectRoot, 'src/lib/youpi.ts'), 'utf8');

  assert.ok(youpiContent.includes('createMysticSession as createYoupiSession'), 'youpi.ts must re-export createYoupiSession');
  assert.ok(youpiContent.includes('verifyMysticSignature as verifyYoupiSignature'), 'youpi.ts must re-export verifyYoupiSignature');
  assert.ok(youpiContent.includes('getStrictMysticConfig'), 'youpi.ts must re-export getStrictMysticConfig');
  assert.ok(youpiContent.includes('StrictCredentialError'), 'youpi.ts must re-export StrictCredentialError');
  assert.ok(youpiContent.includes('from "./mystic-payments"'), 'youpi.ts must import from mystic-payments');
});
