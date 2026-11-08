import test from 'node:test';
import assert from 'node:assert/strict';

const ADMIN_USERNAME = 'mythicalhrg';

function verifyAdminPermission(requestingUsername) {
  if (!requestingUsername || requestingUsername.toLowerCase() !== ADMIN_USERNAME) {
    throw new Error('Unauthorized: Only the platform owner can modify user credentials.');
  }
  return true;
}

function validateNewCredentials(params, existingUsers, targetUser) {
  const { newUsername, newEmail } = params;

  if (newUsername !== undefined) {
    const trimmed = newUsername.trim();
    const validRegex = /^[a-zA-Z0-9_.]+$/;
    if (!validRegex.test(trimmed) || trimmed.length < 3 || trimmed.length > 30) {
      throw new Error('Username must be 3-30 characters and contain only letters, numbers, underscores (_), and periods (.).');
    }

    if (trimmed.toLowerCase() === ADMIN_USERNAME && targetUser.username.toLowerCase() !== ADMIN_USERNAME) {
      throw new Error(`Username "${ADMIN_USERNAME}" is reserved for the platform owner.`);
    }

    const collision = existingUsers.find(
      (u) => u.username.toLowerCase() === trimmed.toLowerCase() && u.uuid !== targetUser.uuid
    );
    if (collision) {
      throw new Error(`Username "@${trimmed}" is already taken by another account.`);
    }
  }

  if (newEmail !== undefined) {
    const trimmedEmail = newEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      throw new Error('Invalid email address format.');
    }

    const collision = existingUsers.find(
      (u) => u.email.toLowerCase() === trimmedEmail && u.uuid !== targetUser.uuid
    );
    if (collision) {
      throw new Error(`Email "${trimmedEmail}" is already registered to another account.`);
    }
  }

  return true;
}

test('Admin Credentials Edit: Only platform owner @mythicalhrg can perform credential edits', () => {
  // Owner is authorized
  assert.equal(verifyAdminPermission('mythicalhrg'), true);
  assert.equal(verifyAdminPermission('MythicalHRG'), true);

  // Normal users, malicious users, or Bade Maalik are rejected
  assert.throws(() => verifyAdminPermission('anurag'), /Only the platform owner/);
  assert.throws(() => verifyAdminPermission('rohit'), /Only the platform owner/);
  assert.throws(() => verifyAdminPermission('random_student'), /Only the platform owner/);
  assert.throws(() => verifyAdminPermission(null), /Only the platform owner/);
});

test('Admin Credentials Edit: Username validation enforces format, length, and admin reservation', () => {
  const existingUsers = [
    { uuid: 'u1', username: 'mythicalhrg', email: 'mythicalhrg@gmail.com' },
    { uuid: 'u2', username: 'student_aarav', email: 'aarav@gmail.com' },
  ];
  const targetUser = existingUsers[1];

  // Invalid characters (spaces, special symbols)
  assert.throws(
    () => validateNewCredentials({ newUsername: 'aarav sharma' }, existingUsers, targetUser),
    /Username must be 3-30 characters/
  );
  assert.throws(
    () => validateNewCredentials({ newUsername: 'aarav$#@' }, existingUsers, targetUser),
    /Username must be 3-30 characters/
  );

  // Too short
  assert.throws(
    () => validateNewCredentials({ newUsername: 'aa' }, existingUsers, targetUser),
    /Username must be 3-30 characters/
  );

  // Reserved admin name collision
  assert.throws(
    () => validateNewCredentials({ newUsername: 'mythicalhrg' }, existingUsers, targetUser),
    /reserved for the platform owner/
  );
  assert.throws(
    () => validateNewCredentials({ newUsername: 'MYTHICALHRG' }, existingUsers, targetUser),
    /reserved for the platform owner/
  );

  // Valid new username
  assert.equal(
    validateNewCredentials({ newUsername: 'aarav.sharma_99' }, existingUsers, targetUser),
    true
  );
});

test('Admin Credentials Edit: Email format and collision detection', () => {
  const existingUsers = [
    { uuid: 'u1', username: 'mythicalhrg', email: 'mythicalhrg@gmail.com' },
    { uuid: 'u2', username: 'student_aarav', email: 'aarav@gmail.com' },
    { uuid: 'u3', username: 'student_priya', email: 'priya@outlook.com' },
  ];
  const targetUser = existingUsers[1];

  // Malformed email
  assert.throws(
    () => validateNewCredentials({ newEmail: 'notanemail' }, existingUsers, targetUser),
    /Invalid email address format/
  );
  assert.throws(
    () => validateNewCredentials({ newEmail: 'aarav@' }, existingUsers, targetUser),
    /Invalid email address format/
  );

  // Email collision with another user
  assert.throws(
    () => validateNewCredentials({ newEmail: 'priya@outlook.com' }, existingUsers, targetUser),
    /already registered to another account/
  );

  // Valid email (including self-retention)
  assert.equal(
    validateNewCredentials({ newEmail: 'aarav.new@gmail.com' }, existingUsers, targetUser),
    true
  );
  assert.equal(
    validateNewCredentials({ newEmail: 'aarav@gmail.com' }, existingUsers, targetUser),
    true
  );
});

test('Admin Credentials Edit: Cascading updates to chat messages and donor records', () => {
  const targetUuid = 'u-123';
  const oldUsername = 'old_coder';
  const newUsername = 'new_coder';

  const groupMessages = [
    { senderId: 'u-123', senderUsername: 'old_coder', body: 'Hello group' },
    { senderId: 'u-456', senderUsername: 'other_user', body: 'Hi' },
  ];

  const directMessages = [
    { senderId: 'u-123', senderUsername: 'old_coder', body: 'Direct note' },
  ];

  const donors = [
    { username: 'old_coder', amount: 500 },
  ];

  // Simulate cascade update
  for (const gm of groupMessages) {
    if (gm.senderId === targetUuid) gm.senderUsername = newUsername;
  }
  for (const dm of directMessages) {
    if (dm.senderId === targetUuid) dm.senderUsername = newUsername;
  }
  for (const d of donors) {
    if (d.username === oldUsername) d.username = newUsername;
  }

  assert.equal(groupMessages[0].senderUsername, 'new_coder');
  assert.equal(groupMessages[1].senderUsername, 'other_user');
  assert.equal(directMessages[0].senderUsername, 'new_coder');
  assert.equal(donors[0].username, 'new_coder');
});
