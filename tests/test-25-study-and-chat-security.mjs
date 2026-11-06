import test from "node:test";
import assert from "node:assert/strict";

process.env.CHAT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
const { encryptChatBody, decryptChatBody } = await import("../src/lib/chat-crypto.ts");
const { getReviewIntervalDays } = await import("../src/lib/spaced-repetition.ts");

test("Review ratings schedule stable, increasing intervals", () => {
  assert.equal(getReviewIntervalDays("again", 10, 4), 1);
  assert.equal(getReviewIntervalDays("hard", 10, 4), 12);
  assert.equal(getReviewIntervalDays("good", 0, 0), 1);
  assert.equal(getReviewIntervalDays("good", 1, 1), 3);
  assert.equal(getReviewIntervalDays("good", 5, 2), 11);
  assert.equal(getReviewIntervalDays("easy", 5, 2), 13);
  assert.equal(getReviewIntervalDays("hard", Number.NaN, -1), 1);
});

test("Chat encryption hides message text and binds ciphertext to conversation and sender", () => {
  const plaintext = "private study message";
  const context = "conversation-1:sender-1";
  const encrypted = encryptChatBody(plaintext, context);
  assert.match(encrypted, /^v1:/);
  assert.ok(!encrypted.includes(plaintext));
  assert.equal(decryptChatBody(encrypted, context), plaintext);
  assert.throws(() => decryptChatBody(encrypted, "conversation-2:sender-1"));
  const tampered = `${encrypted.slice(0, 4)}${encrypted[4] === "A" ? "B" : "A"}${encrypted.slice(5)}`;
  assert.throws(() => decryptChatBody(tampered, context));
});

test("Chat encryption fails closed when its key is missing or invalid", () => {
  const key = process.env.CHAT_ENCRYPTION_KEY;
  delete process.env.CHAT_ENCRYPTION_KEY;
  assert.throws(() => encryptChatBody("message", "context"), /not configured/);
  process.env.CHAT_ENCRYPTION_KEY = "short";
  assert.throws(() => encryptChatBody("message", "context"), /32-byte key/);
  process.env.CHAT_ENCRYPTION_KEY = key;
});
