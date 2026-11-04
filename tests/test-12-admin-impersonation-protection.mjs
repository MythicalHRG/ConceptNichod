import test from 'node:test';
import assert from 'node:assert/strict';

const ADMIN_USERNAME = 'mythicalhrg';

function validateRegistrationUsername(username) {
  const normalized = (username || '').toLowerCase().trim();
  if (normalized === ADMIN_USERNAME) {
    throw new Error('This username is reserved for system administration.');
  }
  return true;
}

function validateProfileUpdate(currentUsername, newUsername) {
  const normalizedCurrent = (currentUsername || '').toLowerCase().trim();
  const normalizedNew = (newUsername || '').toLowerCase().trim();

  if (normalizedNew === ADMIN_USERNAME && normalizedCurrent !== ADMIN_USERNAME) {
    throw new Error('This username is reserved for system administration.');
  }
  return true;
}

test('Tareeka 12: Normal user cannot register with mythicalhrg admin username', () => {
  assert.throws(() => validateRegistrationUsername('mythicalhrg'), /reserved/);
  assert.throws(() => validateRegistrationUsername('MythicalHRG'), /reserved/);
  assert.throws(() => validateRegistrationUsername('  MYTHICALHRG  '), /reserved/);
  assert.equal(validateRegistrationUsername('student_john'), true);
});

test('Tareeka 12: Existing non-admin user cannot rename profile to mythicalhrg', () => {
  assert.throws(() => validateProfileUpdate('student_john', 'mythicalhrg'), /reserved/);
  assert.throws(() => validateProfileUpdate('student_john', 'MythicalHRG'), /reserved/);
  assert.equal(validateProfileUpdate('mythicalhrg', 'mythicalhrg'), true, 'Admin can retain their username');
});
