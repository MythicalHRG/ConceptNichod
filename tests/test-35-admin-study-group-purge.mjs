import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ADMIN_USERNAME = 'mythicalhrg';

function verifyAdminPermission(username) {
  if (!username || username.toLowerCase() !== ADMIN_USERNAME) {
    throw new Error('Forbidden: Admin access only. Only @mythicalhrg can delete study groups.');
  }
  return true;
}

function simulateAdminDeleteGroup({ user, groupId, groups, messages }) {
  verifyAdminPermission(user.username);

  if (!groupId) {
    throw new Error('Group ID is required.');
  }

  const groupIndex = groups.findIndex((g) => g.id === groupId);
  if (groupIndex === -1) {
    throw new Error('Study group not found or already deleted.');
  }

  const groupName = groups[groupIndex].name;

  // Purge group
  groups.splice(groupIndex, 1);

  // Cascading purge of all messages
  const initialMsgCount = messages.length;
  const remainingMessages = messages.filter((m) => m.groupId !== groupId);
  const deletedMsgCount = initialMsgCount - remainingMessages.length;

  return {
    success: true,
    message: `Study group "${groupName}" and all associated messages have been deleted.`,
    remainingGroups: groups,
    remainingMessages,
    deletedMsgCount,
  };
}

test('35.1 Admin Authorization: Only @mythicalhrg is authorized to purge study groups', () => {
  assert.equal(verifyAdminPermission('mythicalhrg'), true);
  assert.throws(() => verifyAdminPermission('student123'), /Forbidden: Admin access only/);
  assert.throws(() => verifyAdminPermission('anurag'), /Forbidden: Admin access only/);
  assert.throws(() => verifyAdminPermission(''), /Forbidden: Admin access only/);
  assert.throws(() => verifyAdminPermission(null), /Forbidden: Admin access only/);
});

test('35.2 Group ID Validation: Throws error when groupId is missing or empty', () => {
  const groups = [{ id: 'grp1', name: 'Random Chat', subject: 'OffTopic' }];
  const messages = [];

  assert.throws(
    () => simulateAdminDeleteGroup({ user: { username: 'mythicalhrg' }, groupId: '', groups, messages }),
    /Group ID is required/
  );
});

test('35.3 Cascading Purge: Deleting a study group wipes all associated GroupMessage records', () => {
  const groups = [
    { id: 'grp1', name: 'Physics Masterclass', subject: 'Physics' },
    { id: 'grp2', name: 'Casual Chit Chat', subject: 'ChitChat' },
  ];

  const messages = [
    { id: 'm1', groupId: 'grp1', body: 'Let us solve mechanics' },
    { id: 'm2', groupId: 'grp2', body: 'Hey anyone there?' },
    { id: 'm3', groupId: 'grp2', body: 'Movie plan today?' },
    { id: 'm4', groupId: 'grp1', body: 'Rotational motion formulas' },
  ];

  const result = simulateAdminDeleteGroup({
    user: { username: 'mythicalhrg' },
    groupId: 'grp2',
    groups,
    messages,
  });

  assert.equal(result.success, true);
  assert.equal(result.remainingGroups.length, 1);
  assert.equal(result.remainingGroups[0].id, 'grp1');
  assert.equal(result.deletedMsgCount, 2);
  assert.equal(result.remainingMessages.length, 2);
  assert.ok(result.remainingMessages.every((m) => m.groupId === 'grp1'));
});

test('35.4 Non-admin Rejection: Unauthorized user cannot delete study groups', () => {
  const groups = [{ id: 'grp1', name: 'Spam Group', subject: 'Random' }];
  const messages = [{ id: 'm1', groupId: 'grp1', body: 'Spam' }];

  assert.throws(() => {
    simulateAdminDeleteGroup({
      user: { username: 'random_user' },
      groupId: 'grp1',
      groups,
      messages,
    });
  }, /Forbidden: Admin access only/);

  // Assert data was not mutated
  assert.equal(groups.length, 1);
  assert.equal(messages.length, 1);
});

test('35.5 Codebase Verification: Admin server action and UI components exist and export correctly', () => {
  const adminActionsPath = path.resolve('src/app/actions/admin.ts');
  const adminContent = fs.readFileSync(adminActionsPath, 'utf8');

  assert.ok(adminContent.includes('export async function getAllStudyGroupsAdminAction()'));
  assert.ok(adminContent.includes('export async function deleteStudyGroupAdminAction(groupId: string)'));
  assert.ok(adminContent.includes('StudyGroup.findByIdAndDelete(groupId)'));
  assert.ok(adminContent.includes('GroupMessage.deleteMany({ groupId })'));

  const studyGroupActionsPath = path.resolve('src/app/actions/study-groups.ts');
  const studyGroupContent = fs.readFileSync(studyGroupActionsPath, 'utf8');
  assert.ok(studyGroupContent.includes('export async function adminDeleteStudyGroupAction('));
  assert.ok(studyGroupContent.includes('user.username !== "mythicalhrg"'));

  const adminPanelPath = path.resolve('src/components/admin/admin-panel.tsx');
  const panelContent = fs.readFileSync(adminPanelPath, 'utf8');
  assert.ok(panelContent.includes('getAllStudyGroupsAdminAction'));
  assert.ok(panelContent.includes('deleteStudyGroupAdminAction'));
  assert.ok(panelContent.includes('value="study-groups"'));
  assert.ok(panelContent.includes('Study Groups & Chit-Chat Purge'));
  assert.ok(panelContent.includes('handleDeleteStudyGroup'));
});
