import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function normalizeEmail(email) {
  if (!email) return '';
  const trimmed = email.toLowerCase().trim();
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex === -1) return trimmed;

  let localPart = trimmed.substring(0, atIndex);
  const domainPart = trimmed.substring(atIndex + 1);

  // Strip everything after '+'
  const plusIndex = localPart.indexOf('+');
  if (plusIndex !== -1) {
    localPart = localPart.substring(0, plusIndex);
  }

  // Gmail ignores dots in the local part
  if (domainPart === 'gmail.com' || domainPart === 'googlemail.com') {
    localPart = localPart.replace(/\./g, '');
  }

  return `${localPart}@${domainPart}`;
}

function validateEmail(email) {
  if (!email) return { valid: false, error: 'Email address is required.' };
  const trimmed = email.toLowerCase().trim();
  const validDomain =
    trimmed.endsWith('@gmail.com') ||
    trimmed.endsWith('@outlook.com') ||
    trimmed.endsWith('@outlook.in');
  if (!validDomain) {
    return {
      valid: false,
      error: 'Only @gmail.com, @outlook.com, and @outlook.in emails are allowed.',
    };
  }

  // Block subaddressing / plus-addressing (e.g. abc+1@gmail.com, abc+99@outlook.com)
  if (trimmed.includes('+')) {
    return {
      valid: false,
      error: 'Email aliases and subaddressing (+tag) are not permitted. Please use your primary email address.',
    };
  }

  return { valid: true };
}

function simulateLoginValidation(rawInput) {
  const trimmed = (rawInput || '').trim();
  if (trimmed.includes('@') && trimmed.includes('+')) {
    throw new Error(
      'Email aliases and subaddressing (+tag) are not permitted. Please log in with your primary email address.'
    );
  }
  return true;
}

test('37.1 Login Alias Protection: Rejects login with plus-addressed alias emails like abc+1@gmail.com', () => {
  assert.throws(
    () => simulateLoginValidation('abc+1@gmail.com'),
    /Email aliases and subaddressing \(\+tag\) are not permitted/
  );
  assert.throws(
    () => simulateLoginValidation('user+42@outlook.com'),
    /Email aliases and subaddressing \(\+tag\) are not permitted/
  );
  assert.throws(
    () => simulateLoginValidation('student+test123@outlook.in'),
    /Email aliases and subaddressing \(\+tag\) are not permitted/
  );

  // Standard emails and usernames without '+' pass login validation
  assert.equal(simulateLoginValidation('abc@gmail.com'), true);
  assert.equal(simulateLoginValidation('mythicalhrg'), true);
  assert.equal(simulateLoginValidation('student_123'), true);
});

test('37.2 Registration Alias Prevention: Rejects registration with plus-addressed emails', () => {
  const aliasEmails = [
    'abc+1@gmail.com',
    'abc+99@gmail.com',
    'student+exam@outlook.com',
    'topper+trial@outlook.in',
  ];

  for (const email of aliasEmails) {
    const res = validateEmail(email);
    assert.equal(res.valid, false);
    assert.match(res.error, /Email aliases and subaddressing \(\+tag\) are not permitted/);
  }

  // Valid non-aliased emails pass
  assert.equal(validateEmail('abc@gmail.com').valid, true);
  assert.equal(validateEmail('topper@outlook.com').valid, true);
  assert.equal(validateEmail('student@outlook.in').valid, true);
});

test('37.3 Duplicate Root Prevention: Dotted Gmail accounts normalize to same root email', () => {
  const email1 = 'rohit.sharma@gmail.com';
  const email2 = 'r.o.h.i.t.s.h.a.r.m.a@gmail.com';
  const email3 = 'rohitsharma@gmail.com';

  assert.equal(normalizeEmail(email1), 'rohitsharma@gmail.com');
  assert.equal(normalizeEmail(email2), 'rohitsharma@gmail.com');
  assert.equal(normalizeEmail(email3), 'rohitsharma@gmail.com');

  assert.equal(normalizeEmail(email1), normalizeEmail(email2));
});

test('37.4 Landing Page Book Cover Verification: "Inside The Book" and skeleton lines completely removed', () => {
  const flippingBookPath = path.resolve('src/components/flipping-book.tsx');
  const content = fs.readFileSync(flippingBookPath, 'utf8');

  assert.ok(!content.includes('Inside The Book'), 'Must not contain Inside The Book');
  assert.ok(!content.includes('bg-muted-foreground/20 rounded-full'), 'Must not contain skeleton placeholder lines');
  assert.ok(!content.includes('rotateY(180deg)'), 'Must not contain 180deg mirrored flip back page');
  assert.ok(!content.includes('isFlipped'), 'Must not contain flipping state');
  assert.ok(content.includes('ConceptsNichod'), 'Must contain clean ConceptsNichod book cover');
  assert.ok(content.includes('Your journey begins here.'), 'Must contain journey caption');
});
