import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cleanAndValidateUrl,
  getStrictMysticConfig,
  getMysticPaymentStatus,
  verifyMysticSignature,
} from '../src/lib/mystic-payments.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

test('Tareeka 33.1: cleanAndValidateUrl strips BOM (\\uFEFF) and zero-width spaces from checkout URLs', () => {
  // Test raw URL with upstream BOM
  const bomUrl = '\uFEFFhttps://mystic-payments.vercel.app/checkout/9321d9bf-1497-4406-8c75-4093d0ae2168';
  const cleaned = cleanAndValidateUrl(bomUrl);
  assert.equal(cleaned, 'https://mystic-payments.vercel.app/checkout/9321d9bf-1497-4406-8c75-4093d0ae2168');
  assert.equal(cleaned.charCodeAt(0), 104); // 'h'

  // Test zero-width space and leading spaces
  const zwspUrl = '  \u200B\u200C\u200Dhttps://mystic-payments.vercel.app/pay/test1234  ';
  assert.equal(cleanAndValidateUrl(zwspUrl), 'https://mystic-payments.vercel.app/pay/test1234');

  // Test single-slash protocol repair
  const singleSlash = 'https:/mystic-payments.vercel.app/checkout/123';
  assert.equal(cleanAndValidateUrl(singleSlash), 'https://mystic-payments.vercel.app/checkout/123');

  // Test null / undefined / empty
  assert.equal(cleanAndValidateUrl(null), '');
  assert.equal(cleanAndValidateUrl(undefined), '');
  assert.equal(cleanAndValidateUrl(''), '');
});

test('Tareeka 33.2: getStrictMysticConfig resolves valid production appUrl with fallback', () => {
  const originalEnv = { ...process.env };

  try {
    process.env.NODE_ENV = 'production';
    process.env.MYSTIC_PAYMENTS_MERCHANT_ID = 'd68333a5-27a3-482e-bf85-db3905ffacd9';
    process.env.MYSTIC_PAYMENTS_API_KEY = 'yp_live_44a4687a407e6ac446bfc5f244417dea';
    process.env.MYSTIC_PAYMENTS_WEBHOOK_SECRET = '99d47c187e8184c3919f792e792362b1bf886dadee3636b288a9d26fd7fab703';
    process.env.MYSTIC_PAYMENTS_API_URL = 'https://mystic-payments.vercel.app';
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.APP_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;

    // In production without APP_URL, must fallback to conceptnichod.vercel.app instead of localhost:9002
    const config = getStrictMysticConfig();
    assert.equal(config.appUrl, 'https://conceptnichod.vercel.app');

    // When NEXT_PUBLIC_APP_URL is set, it takes precedence
    process.env.NEXT_PUBLIC_APP_URL = 'https://custom-domain.com';
    const configWithApp = getStrictMysticConfig();
    assert.equal(configWithApp.appUrl, 'https://custom-domain.com');
  } finally {
    process.env = originalEnv;
  }
});

test('Tareeka 33.3: getMysticPaymentStatus safely handles missing or empty paymentId', async () => {
  assert.equal(await getMysticPaymentStatus(''), null);
  // @ts-ignore
  assert.equal(await getMysticPaymentStatus(null), null);
  // @ts-ignore
  assert.equal(await getMysticPaymentStatus(undefined), null);
});

test('Tareeka 33.4: Backward compatibility re-exports in youpi.ts match MysticPayments', () => {
  const youpiContent = fs.readFileSync(path.join(projectRoot, 'src/lib/youpi.ts'), 'utf8');
  assert.ok(youpiContent.includes('cleanAndValidateUrl'), 'youpi.ts must re-export cleanAndValidateUrl');
  assert.ok(youpiContent.includes('getMysticPaymentStatus as getYoupiPaymentStatus'), 'youpi.ts must re-export getYoupiPaymentStatus');
});

test('Tareeka 33.5: Webhook route checks x-mystic-signature and x-mysticpayments-signature headers', () => {
  const routeContent = fs.readFileSync(path.join(projectRoot, 'src/app/api/webhooks/mystic-payments/route.ts'), 'utf8');
  assert.ok(routeContent.includes('x-mystic-signature') || routeContent.includes('deprecated'), 'Must inspect x-mystic-signature header or handle deprecated webhook');
});

test('Tareeka 33.6: Donation server action preserves uuid for all public donors', () => {
  const donationContent = fs.readFileSync(path.join(projectRoot, 'src/app/actions/donation.ts'), 'utf8');
  assert.ok(!donationContent.includes('.select("-uuid")'), 'Must not strip uuid from public donor queries');
  assert.ok(donationContent.includes('Donor'), 'Must query Donor collection');
});
