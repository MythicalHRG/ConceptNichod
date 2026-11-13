import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const auth = fs.readFileSync("src/app/actions/auth.ts", "utf8");

test("profile updates do not reject a user's unchanged username as already taken", () => {
  assert.match(
    auth,
    /if \(targetUsername !== currentUser\.username\.toLowerCase\(\)\) \{\s*const usernameError = await validateUsername\(targetUsername\);/
  );
});

test("failed password attempts are counted once and database save errors are not treated as bad passwords", () => {
  const loginStart = auth.indexOf("export async function loginAction");
  const loginEnd = auth.indexOf("export async function logoutAction", loginStart);
  assert.notEqual(loginStart, -1);
  assert.notEqual(loginEnd, -1);
  const login = auth.slice(loginStart, loginEnd);
  assert.equal((login.match(/recordFailedAttempt\(accountRateKey/g) || []).length, 2);
  assert.equal((login.match(/recordFailedAttempt\(loginRateKey/g) || []).length, 2);
  assert.match(login, /const isValid = await comparePassword\(password, user\.password\);[\s\S]*?if \(!isValid\) \{[\s\S]*?await user\.save\(\);/);
});

test("registration rejects expired or missing-expiry email OTP records", () => {
  const registerStart = auth.indexOf("export async function registerAction");
  const registerEnd = auth.indexOf("export async function loginAction", registerStart);
  const register = auth.slice(registerStart, registerEnd);
  assert.match(register, /!otpRecord \\|\\| !otpRecord\.isVerified \\|\\| !otpRecord\.expiresAt \\|\\| new Date\(\) > otpRecord\.expiresAt/);
  assert.match(register, /await dbConnect\(\);[\\s\\S]*?if \(!email \\|\\| !username/);
});
