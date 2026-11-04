import assert from "node:assert";
import test from "node:test";

function validatePassword(password) {
  if (!password || password.length < 8) return "Password must be at least 8 characters long.";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter.";
  if (!/[0-9]/.test(password)) return "Password must contain at least one number.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must contain at least one special symbol.";
  return null;
}

function validateEmailDomain(email) {
  if (!email) return false;
  const lower = email.toLowerCase().trim();
  return lower.endsWith("@gmail.com") || lower.endsWith("@outlook.com") || lower.endsWith("@outlook.in");
}

test("Tareeka 8: Password complexity rules enforce uppercase, lowercase, numbers, and symbols", () => {
  assert.notStrictEqual(validatePassword("short1!"), null, "Should reject < 8 chars");
  assert.notStrictEqual(validatePassword("alllowercase1!"), null, "Should reject missing uppercase");
  assert.notStrictEqual(validatePassword("ALLUPPERCASE1!"), null, "Should reject missing lowercase");
  assert.notStrictEqual(validatePassword("NoNumbersHere!"), null, "Should reject missing number");
  assert.notStrictEqual(validatePassword("NoSymbols1234"), null, "Should reject missing symbol");

  assert.strictEqual(validatePassword("SecureP@ssw0rd!"), null, "Strong password should be accepted");
});

test("Tareeka 8: Allowed email domains restrict registration to Gmail and Outlook", () => {
  assert.strictEqual(validateEmailDomain("student@gmail.com"), true);
  assert.strictEqual(validateEmailDomain("student@outlook.com"), true);
  assert.strictEqual(validateEmailDomain("student@outlook.in"), true);

  assert.strictEqual(validateEmailDomain("hacker@tempmail.com"), false);
  assert.strictEqual(validateEmailDomain("user@yahoo.com"), false);
  assert.strictEqual(validateEmailDomain("test@protonmail.com"), false);
});
