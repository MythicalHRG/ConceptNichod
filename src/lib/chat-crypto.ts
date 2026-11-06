import crypto from "crypto";

function getKey() {
  const encoded = process.env.CHAT_ENCRYPTION_KEY;
  if (!encoded) throw new Error("Chat encryption is not configured.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("CHAT_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}

export function encryptChatBody(plaintext: string, context: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url")}`;
}

export function decryptChatBody(envelope: string, context: string) {
  if (!envelope.startsWith("v1:")) throw new Error("Unsupported encrypted chat message.");
  const payload = Buffer.from(envelope.slice(3), "base64url");
  if (payload.length < 29) throw new Error("Invalid encrypted chat message.");
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
