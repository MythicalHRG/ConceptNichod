import assert from "node:assert";
import test from "node:test";

// Simulating validateUsername from src/app/actions/auth.ts
function validateUsername(username) {
  if (!username || username.length < 3 || username.length > 30) {
    return "Username must be between 3 and 30 characters long.";
  }
  // Only alphanumeric characters, underscores (_), and periods (.)
  // No spaces, and no @, /, (, ), +, -, &, ", *, ', :, ;, !, ?, #, or ₹
  const validUsernameRegex = /^[a-zA-Z0-9_.]+$/;
  if (!validUsernameRegex.test(username)) {
    return "Usernames can only include letters, numbers, underscores (_), and periods (.). Spaces and other symbols are not allowed.";
  }
  return null;
}

test("Tareeka 2: Username validation rejects forbidden symbols explicitly specified by user", () => {
  const forbiddenInputs = [
    "@rohit",         // @ symbol
    "@anurag",        // @ symbol
    "anurag sharma",  // space
    "test/user",      // / symbol
    "student(1)",     // ( and )
    "math+coder",     // + symbol
    "user-name",      // - symbol
    "john&jane",      // & symbol
    'user"quote',     // " symbol
    "star*user",      // * symbol
    "user'name",      // ' symbol
    "admin:root",     // : symbol
    "code;hack",      // ; symbol
    "hello!world",    // ! symbol
    "who?me",         // ? symbol
    "user#1",         // # symbol
    "price₹100",      // ₹ symbol
    "student🔥",      // emoji
    "   ",            // spaces
    "ab",             // too short (< 3)
    "a".repeat(31),   // too long (> 30)
  ];

  for (const input of forbiddenInputs) {
    const error = validateUsername(input);
    assert.notStrictEqual(
      error,
      null,
      `Expected input "${input}" to be rejected, but it was accepted!`
    );
  }
});

test("Tareeka 2: Username validation accepts legitimate alphanumeric, underscore, and period combinations", () => {
  const validInputs = [
    "anurag",
    "rohit",
    "mythicalhrg",
    "john_doe",
    "user.name",
    "student_2026.cbse",
    "Kavya_123",
    "A.B.C",
  ];

  for (const input of validInputs) {
    const error = validateUsername(input);
    assert.strictEqual(
      error,
      null,
      `Expected valid username "${input}" to be accepted, but got error: ${error}`
    );
  }
});
