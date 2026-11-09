import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Suite 38: Username & Email Existence, Owner Security, and Date of Birth
// ---------------------------------------------------------------------------

test('38.1 Username Uniqueness in validateUsername and registerAction', () => {
  const authActionPath = path.resolve('src/app/actions/auth.ts');
  const content = fs.readFileSync(authActionPath, 'utf-8');

  // Verify validateUsername queries database for existing username case-insensitively
  assert.ok(content.includes('existingUserByUsername'), 'registerAction must query existing username');
  assert.ok(content.includes('A user with this username already exists. Please choose a different username.'), 'Must return descriptive error on taken username');
  assert.ok(content.includes('mythicalhrg@gmail.com'), 'Must protect mythicalhrg@gmail.com as owner email');
});

test('38.2 Registration OTP fails closed when email already exists', () => {
  const otpRoutePath = path.resolve('src/app/api/auth/otp/route.ts');
  const content = fs.readFileSync(otpRoutePath, 'utf-8');

  // Verify that when not a password reset, OTP route checks if email already exists
  assert.ok(content.includes("This email is already registered. Please log in instead."), 'Must reject OTP request if email is already registered');
  // Verify that owner email is blocked from registration OTP
  assert.ok(content.includes("mythicalhrg@gmail.com"), 'Must block owner email from registration OTP');
  // Verify username check in OTP route
  assert.ok(content.includes("A user with this username already exists. Please choose a different username."), 'Must validate username availability in OTP route');
});

test('38.3 Owner security guards protect mythicalhrg and mythicalhrg@gmail.com', () => {
  const authActionPath = path.resolve('src/app/actions/auth.ts');
  const adminActionPath = path.resolve('src/app/actions/admin.ts');
  const authContent = fs.readFileSync(authActionPath, 'utf-8');
  const adminContent = fs.readFileSync(adminActionPath, 'utf-8');

  // Danger zone account deletion guards
  assert.ok(authContent.includes('mythicalhrg@gmail.com'), 'Must guard mythicalhrg@gmail.com against account deletion');
  // Admin authorization checks
  assert.ok(adminContent.includes('mythicalhrg@gmail.com'), 'Admin authorization must recognize mythicalhrg@gmail.com');
});

test('38.4 User Profiles display Birthday with Lucide Cake icon matching other detail badges', () => {
  const publicProfilePath = path.resolve('src/app/profile/[username]/page.tsx');
  const dashboardPath = path.resolve('src/app/dashboard/page.tsx');
  const userProfileBtnPath = path.resolve('src/components/auth/user-profile-button.tsx');

  const publicContent = fs.readFileSync(publicProfilePath, 'utf-8');
  const dashContent = fs.readFileSync(dashboardPath, 'utf-8');
  const btnContent = fs.readFileSync(userProfileBtnPath, 'utf-8');

  // Public profile displays Birthday with Lucide Cake icon
  assert.ok(publicContent.includes('user.dob'), 'Public profile must display user.dob');
  assert.ok(publicContent.includes('Birthday:'), 'Public profile must show Birthday: label');
  assert.ok(publicContent.includes('Cake'), 'Public profile must show Lucide Cake icon');
  assert.ok(publicContent.includes('text-pink-500'), 'Public profile Cake icon must be styled with text-pink-500');

  // Dashboard hero card displays Birthday with Lucide Cake icon
  assert.ok(dashContent.includes('user.dob'), 'Dashboard must display user.dob');
  assert.ok(dashContent.includes('Birthday:'), 'Dashboard must show Birthday: label');
  assert.ok(dashContent.includes('Cake'), 'Dashboard must show Lucide Cake icon');
  assert.ok(dashContent.includes('text-pink-500'), 'Dashboard Cake icon must be styled with text-pink-500');

  // Profile modal displays Birthday with Lucide Cake icon
  assert.ok(btnContent.includes('Birthday'), 'User profile modal must display Birthday label');
  assert.ok(btnContent.includes('Cake'), 'User profile modal must show Lucide Cake icon');
  assert.ok(btnContent.includes('user?.dob'), 'User profile modal must access user?.dob');
});
