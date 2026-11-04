import test from 'node:test';
import assert from 'node:assert/strict';

function simulateOtpVerification(record, inputOtp) {
  const MAX_ATTEMPTS = 5;
  const sanitized = (inputOtp || '').trim();

  record.attempts = (record.attempts || 0) + 1;

  if (record.attempts > MAX_ATTEMPTS) {
    return { status: 429, error: 'Too many incorrect attempts. Code invalidated.' };
  }

  if (new Date() > record.expiresAt) {
    return { status: 400, error: 'Verification code has expired.' };
  }

  if (record.otp !== sanitized) {
    const remaining = MAX_ATTEMPTS - record.attempts;
    return { status: 400, error: `Invalid code. ${remaining} attempt(s) remaining.` };
  }

  record.isVerified = true;
  return { status: 200, success: true };
}

test('Tareeka 13: OTP verification locks out attacker after 5 failed attempts', () => {
  const record = {
    otp: '849201',
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    attempts: 0,
    isVerified: false,
  };

  // 5 wrong attempts
  for (let i = 1; i <= 5; i++) {
    const res = simulateOtpVerification(record, '000000');
    assert.equal(res.status, 400);
    assert.ok(res.error.includes('attempt(s) remaining'));
  }

  // 6th attempt should result in 429 lockout and invalidation
  const lockoutRes = simulateOtpVerification(record, '849201'); // even if correct now
  assert.equal(lockoutRes.status, 429);
  assert.ok(lockoutRes.error.includes('invalidated'));
  assert.equal(record.isVerified, false);
});

test('Tareeka 13: Expired OTP is strictly rejected', () => {
  const record = {
    otp: '849201',
    expiresAt: new Date(Date.now() - 1000), // expired 1s ago
    attempts: 0,
    isVerified: false,
  };

  const res = simulateOtpVerification(record, '849201');
  assert.equal(res.status, 400);
  assert.ok(res.error.includes('expired'));
  assert.equal(record.isVerified, false);
});
