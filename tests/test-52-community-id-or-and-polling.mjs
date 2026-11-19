import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("private study-group messages and writes require server-verified membership", () => {
  const source = fs.readFileSync("src/app/actions/study-groups.ts", "utf8");
  const readStart = source.indexOf("export async function getGroupMessagesAction(");
  const readEnd = source.indexOf("\nexport async function sendGroupMessageAction(", readStart);
  const readAction = source.slice(readStart, readEnd);
  assert.match(readAction, /group\.memberIds\.includes\(user\.uuid\)/);
  const sendStart = readEnd;
  const sendEnd = source.indexOf("\nexport async function ", sendStart + 1);
  const sendAction = source.slice(sendStart, sendEnd);
  assert.match(sendAction, /group\.memberIds\.includes\(user\.uuid\)/);
  assert.match(sendAction, /checkDistributedRateLimit\(`chat-msg:\$\{user\.uuid\}`/);
  assert.match(sendAction, /cleanBody\.length > 2000/);
});

test("DM reads and writes derive the conversation from authenticated participants", () => {
  const source = fs.readFileSync("src/app/actions/study-groups.ts", "utf8");
  assert.match(source, /const participantIds = \[user\.uuid, target\.uuid\]\.sort\(\)/);
  assert.match(source, /const conversationKey = participantIds\.join\(":"\)/);
  assert.match(source, /DirectMessage\.find\(\{ conversationKey \}\)/);
  assert.doesNotMatch(source, /export async function deleteDirectMessageAction/);
});

test("mistake notebook update/delete queries are scoped to the signed-in user", () => {
  const source = fs.readFileSync("src/app/actions/mistakes.ts", "utf8");
  assert.match(source, /MistakeEntry\.findOne\(\{ _id: mistakeId, userId: user\.uuid \}\)/);
  assert.match(source, /MistakeEntry\.deleteOne\(\{ _id: mistakeId, userId: user\.uuid \}\)/);
  assert.match(source, /userId: user\.uuid/);
});

test("study group polling effects cancel their intervals and suppress stale updates", () => {
  const source = fs.readFileSync("src/components/study-groups/study-groups-hub.tsx", "utf8");
  assert.equal((source.match(/clearInterval\(interval\)/g) || []).length, 2);
  assert.match(source, /let isMounted = true/);
  assert.match(source, /if \(isMounted\) setGroupMessages/);
  assert.match(source, /if \(isMounted\) setDirectMessages/);
});
