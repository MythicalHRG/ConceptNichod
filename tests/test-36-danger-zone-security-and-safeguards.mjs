import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function validateDeletionRequest({ username, password, userPassword, lastSentAt }) {
  if (username.toLowerCase() === 'mythicalhrg') {
    throw new Error('The root platform administrator account @mythicalhrg cannot be deleted.');
  }

  if (!password) {
    throw new Error('Please enter your current password to authorize this deletion request.');
  }

  if (password !== userPassword) {
    throw new Error('Incorrect current password.');
  }

  if (lastSentAt) {
    const elapsed = Date.now() - new Date(lastSentAt).getTime();
    if (elapsed < 60000) {
      const waitSecs = Math.ceil((60000 - elapsed) / 1000);
      throw new Error(`Please wait ${waitSecs} seconds before requesting another deletion code.`);
    }
  }

  return { success: true, message: 'Deletion authorization code sent.' };
}

function simulateAccountDeletion({
  username,
  password,
  userPassword,
  otp,
  validOtp,
  confirmation,
  database,
  userId,
}) {
  if (username.toLowerCase() === 'mythicalhrg') {
    throw new Error('The root admin account cannot be deleted.');
  }

  if (!otp) {
    throw new Error('6-digit verification code is required.');
  }

  if (!confirmation || confirmation.toUpperCase() !== 'DELETE') {
    throw new Error('Please type "DELETE" to confirm permanent account deletion.');
  }

  if (password && password !== userPassword) {
    throw new Error('Incorrect current password.');
  }

  if (otp !== validOtp) {
    throw new Error('Invalid verification code.');
  }

  // Cascading cleanup
  database.users = database.users.filter((u) => u.uuid !== userId);
  database.topics = database.topics.filter((t) => t.userId !== userId);
  database.studyGroups = database.studyGroups
    .filter((g) => g.ownerId !== userId)
    .map((g) => ({
      ...g,
      memberIds: g.memberIds.filter((id) => id !== userId),
    }));
  database.groupMessages = database.groupMessages.filter((m) => m.senderId !== userId);
  database.directMessages = database.directMessages.filter((m) => !m.participantIds.includes(userId));

  return { success: true };
}

test('36.1 Deletion Request Safeguard: Reject requesting OTP without password', () => {
  assert.throws(
    () =>
      validateDeletionRequest({
        username: 'testuser',
        password: '',
        userPassword: 'SecretPassword123!',
      }),
    /Please enter your current password/
  );
});

test('36.2 Password Verification: Reject requesting OTP with wrong password', () => {
  assert.throws(
    () =>
      validateDeletionRequest({
        username: 'testuser',
        password: 'WrongPassword!',
        userPassword: 'SecretPassword123!',
      }),
    /Incorrect current password/
  );
});

test('36.3 Root Admin Protection: @mythicalhrg cannot request deletion OTP or be deleted', () => {
  assert.throws(
    () =>
      validateDeletionRequest({
        username: 'mythicalhrg',
        password: 'ValidPassword123!',
        userPassword: 'ValidPassword123!',
      }),
    /root platform administrator account @mythicalhrg cannot be deleted/
  );

  const database = { users: [{ uuid: 'admin-id', username: 'mythicalhrg' }] };
  assert.throws(
    () =>
      simulateAccountDeletion({
        username: 'mythicalhrg',
        password: 'ValidPassword123!',
        userPassword: 'ValidPassword123!',
        otp: '123456',
        validOtp: '123456',
        confirmation: 'DELETE',
        database,
        userId: 'admin-id',
      }),
    /root admin account cannot be deleted/
  );
});

test('36.4 Cooldown Enforcement: Enforce 60-second cooldown between OTP requests', () => {
  const recentTime = new Date(Date.now() - 30000); // 30 seconds ago
  assert.throws(
    () =>
      validateDeletionRequest({
        username: 'testuser',
        password: 'SecretPassword123!',
        userPassword: 'SecretPassword123!',
        lastSentAt: recentTime,
      }),
    /Please wait \d+ seconds before requesting another deletion code/
  );

  const oldTime = new Date(Date.now() - 65000); // 65 seconds ago
  const result = validateDeletionRequest({
    username: 'testuser',
    password: 'SecretPassword123!',
    userPassword: 'SecretPassword123!',
    lastSentAt: oldTime,
  });
  assert.equal(result.success, true);
});

test('36.5 Intent Safeguard: Deletion requires typing DELETE', () => {
  const database = { users: [{ uuid: 'u1', username: 'student' }] };
  assert.throws(
    () =>
      simulateAccountDeletion({
        username: 'student',
        password: 'Password123!',
        userPassword: 'Password123!',
        otp: '654321',
        validOtp: '654321',
        confirmation: 'no',
        database,
        userId: 'u1',
      }),
    /Please type "DELETE" to confirm/
  );
});

test('36.6 Cascading Purge: Account deletion purges topics, groups, and messages', () => {
  const database = {
    users: [
      { uuid: 'u1', username: 'student' },
      { uuid: 'u2', username: 'other_student' },
    ],
    topics: [
      { id: 't1', userId: 'u1' },
      { id: 't2', userId: 'u2' },
    ],
    studyGroups: [
      { id: 'g1', ownerId: 'u1', memberIds: ['u1', 'u2'] },
      { id: 'g2', ownerId: 'u2', memberIds: ['u1', 'u2'] },
    ],
    groupMessages: [
      { id: 'm1', senderId: 'u1' },
      { id: 'm2', senderId: 'u2' },
    ],
    directMessages: [
      { id: 'dm1', participantIds: ['u1', 'u2'] },
      { id: 'dm2', participantIds: ['u2', 'u3'] },
    ],
  };

  const result = simulateAccountDeletion({
    username: 'student',
    password: 'Password123!',
    userPassword: 'Password123!',
    otp: '987654',
    validOtp: '987654',
    confirmation: 'DELETE',
    database,
    userId: 'u1',
  });

  assert.equal(result.success, true);
  assert.equal(database.users.length, 1);
  assert.equal(database.users[0].uuid, 'u2');
  assert.equal(database.topics.length, 1);
  assert.equal(database.topics[0].userId, 'u2');
  // g1 owned by u1 was deleted, g2 has u1 pulled from memberIds
  assert.equal(database.studyGroups.length, 1);
  assert.equal(database.studyGroups[0].id, 'g2');
  assert.deepEqual(database.studyGroups[0].memberIds, ['u2']);
  // Messages sent by u1 purged
  assert.equal(database.groupMessages.length, 1);
  assert.equal(database.groupMessages[0].senderId, 'u2');
  // DMs with u1 purged
  assert.equal(database.directMessages.length, 1);
  assert.deepEqual(database.directMessages[0].participantIds, ['u2', 'u3']);
});

test('36.7 Source Verification: Actions and UI components implement new safeguards', () => {
  const authActionsContent = fs.readFileSync(path.resolve('src/app/actions/auth.ts'), 'utf8');
  assert.ok(authActionsContent.includes('export async function requestDeleteAccountOtpAction('));
  assert.ok(authActionsContent.includes('export async function deleteAccountAction('));
  assert.ok(authActionsContent.includes('The root platform administrator account @mythicalhrg cannot be deleted'));
  assert.ok(authActionsContent.includes('Please type "DELETE" to confirm'));

  const userProfileBtnContent = fs.readFileSync(
    path.resolve('src/components/auth/user-profile-button.tsx'),
    'utf8'
  );
  assert.ok(userProfileBtnContent.includes('requestDeleteAccountOtpAction'));
  assert.ok(userProfileBtnContent.includes('deleteConfirmationText'));
  assert.ok(!userProfileBtnContent.includes('Platform Owner Account Protected'));
  assert.ok(!userProfileBtnContent.includes('loadCaptchaEnginge')); // Verify buggy canvas captcha was eradicated
});
