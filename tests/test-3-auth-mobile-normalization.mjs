import assert from "node:assert";
import test from "node:test";

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Simulating database lookup query builder from src/app/actions/auth.ts
function buildLoginQuery(rawInput) {
  const trimmed = (rawInput || "").trim();
  if (!trimmed) throw new Error("Missing email or password");

  const safeInput = escapeRegex(trimmed);
  return {
    $or: [
      { email: new RegExp(`^${safeInput}$`, 'i') },
      { username: new RegExp(`^${safeInput}$`, 'i') }
    ]
  };
}

// Simulating OTP sanitization from confirmEmailChangeAction
function sanitizeOtp(rawOtp) {
  return (rawOtp || "").trim();
}

test("Tareeka 3: Mobile keyboard capitalizations in email/username build case-insensitive queries", () => {
  const mobileInputs = [
    "Mythicalhrg@Gmail.Com",
    "  STUDENT@OUTLOOK.COM  ",
    "Rohit.Developer ",
    "Anurag_bade_maalik"
  ];

  for (const input of mobileInputs) {
    const query = buildLoginQuery(input);
    const emailRegex = query.$or[0].email;
    const usernameRegex = query.$or[1].username;

    // Verify regex flags contain 'i' for case-insensitivity
    assert.ok(emailRegex.flags.includes("i"));
    assert.ok(usernameRegex.flags.includes("i"));

    // Verify regex matches regardless of case
    const stripped = input.trim();
    assert.ok(emailRegex.test(stripped.toLowerCase()));
    assert.ok(emailRegex.test(stripped.toUpperCase()));
  }
});

test("Tareeka 3: OTP copied with accidental spaces is sanitized correctly", () => {
  const copiedOtp = "  849201  ";
  const sanitized = sanitizeOtp(copiedOtp);
  assert.strictEqual(sanitized, "849201");
  assert.strictEqual(sanitized.length, 6);
});

test("Tareeka 3: Special characters in email like dots and plus are escaped to prevent ReDoS", () => {
  const trickyInput = "user.name+tag@gmail.com";
  const query = buildLoginQuery(trickyInput);
  const regexStr = query.$or[0].email.source;

  // The dot and plus must be backslash-escaped
  assert.ok(regexStr.includes("\\."));
  assert.ok(regexStr.includes("\\+"));
});
