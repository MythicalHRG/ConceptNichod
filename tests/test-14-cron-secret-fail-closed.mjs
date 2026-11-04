import test from 'node:test';
import assert from 'node:assert/strict';

function checkCronAuth(header, cronSecretEnv) {
  if (!cronSecretEnv) {
    return { status: 401, error: 'Unauthorized (secret not set)' };
  }
  if (header !== `Bearer ${cronSecretEnv}`) {
    return { status: 401, error: 'Unauthorized (invalid secret)' };
  }
  return { status: 200, success: true };
}

test('Tareeka 14: Cron endpoint fails closed when CRON_SECRET is not configured', () => {
  const res = checkCronAuth('Bearer undefined', undefined);
  assert.equal(res.status, 401);
  const resEmpty = checkCronAuth('Bearer test', '');
  assert.equal(resEmpty.status, 401);
});

test('Tareeka 14: Cron endpoint accepts only exact Bearer match', () => {
  const secret = 'super-secret-cron-key-9988';
  assert.equal(checkCronAuth(`Bearer ${secret}`, secret).status, 200);
  assert.equal(checkCronAuth('Bearer wrong-key', secret).status, 401);
  assert.equal(checkCronAuth(null, secret).status, 401);
});
