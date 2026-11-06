import { createServer } from "node:http";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { bot } from "simplex-chat";

const port = Number(process.env.PORT || 7788);
const host = process.env.BRIDGE_HOST || "127.0.0.1";
const dataDir = process.env.DATA_DIR || "./data";
const appBaseUrl = process.env.APP_BASE_URL?.replace(/\/$/, "");
const appSecret = process.env.SIMPLEX_BRIDGE_SECRET;
const webhookSecret = process.env.SIMPLEX_BRIDGE_WEBHOOK_SECRET;
const stateKey = Buffer.from(process.env.BRIDGE_MAPPING_KEY || "", "base64");
const simplexDbKey = process.env.SIMPLEX_DB_ENCRYPTION_KEY;
const userUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const messageIdPattern = /^[0-9a-f]{24}$/i;
const statePath = join(dataDir, "mappings.enc");

if (!appBaseUrl || !appSecret || appSecret.length < 32 || !webhookSecret || webhookSecret.length < 32 || !simplexDbKey || stateKey.length !== 32) {
  throw new Error("Configure APP_BASE_URL, both 32+ character bridge secrets, a 32-byte BRIDGE_MAPPING_KEY, and SIMPLEX_DB_ENCRYPTION_KEY.");
}
if (!appBaseUrl.startsWith("https://")) throw new Error("APP_BASE_URL must use HTTPS.");

function emptyState() {
  return { links: {}, contacts: {}, conversations: {}, delivered: {}, deletionQueue: [] };
}

function seal(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", stateKey, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

function unseal(value) {
  const payload = Buffer.from(value, "base64");
  if (payload.length < 29) throw new Error("Encrypted bridge state is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", stateKey, payload.subarray(0, 12));
  decipher.setAuthTag(payload.subarray(12, 28));
  const decoded = Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString("utf8");
  return JSON.parse(decoded);
}

await mkdir(dataDir, { recursive: true, mode: 0o700 });
let state;
try { state = unseal(await readFile(statePath, "utf8")); }
catch (error) {
  if (error?.code !== "ENOENT") throw error;
  state = emptyState();
}

let persistQueue = Promise.resolve();
function saveState() {
  persistQueue = persistQueue.then(async () => {
    const tempPath = `${statePath}.tmp`;
    await writeFile(tempPath, seal(state), { mode: 0o600 });
    await rename(tempPath, statePath);
  });
  return persistQueue;
}

function equalSecret(actual, expected) {
  const actualBytes = Buffer.from(actual || "");
  const expectedBytes = Buffer.from(expected || "");
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function readJson(request, maxBytes = 12_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error("Payload too large"), { status: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(Object.assign(new Error("Invalid JSON"), { status: 400 })); }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, value) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}

function authorize(request) {
  const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  return equalSecret(token, appSecret);
}

function contactIdFromChatItem(item) {
  const value = item?.chatInfo?.contact?.contactId ?? item?.chatInfo?.chatRef?.contactId;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function chatItemId(item) {
  const value = item?.chatItem?.chatItemId ?? item?.chatItemId;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

async function notifyApp(path, payload) {
  const response = await fetch(`${appBaseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${webhookSecret}` },
    body: JSON.stringify(payload),
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`App callback returned ${response.status}.`);
}

let simplexChat;
let simplexUser;

async function scheduleDeletion(item, chat) {
  const contactId = contactIdFromChatItem(item);
  const itemId = chatItemId(item);
  if (!contactId || !itemId) return;
  const createdAt = Date.now();
  state.deletionQueue.push({ contactId, itemId, expiresAt: createdAt + 24 * 60 * 60 * 1000 });
  await saveState();
}

async function sweepExpiredMessages() {
  const now = Date.now();
  let changed = false;
  for (const [code, link] of Object.entries(state.links)) {
    if (link.expiresAt <= now || link.usedAt) {
      delete state.links[code];
      changed = true;
    }
  }
  for (const [messageId, expiresAt] of Object.entries(state.delivered)) {
    if (expiresAt <= now) {
      delete state.delivered[messageId];
      changed = true;
    }
  }
  const expired = state.deletionQueue.filter((item) => item.expiresAt <= now);
  if (!expired.length) {
    if (changed) await saveState();
    return;
  }
  const keep = state.deletionQueue.filter((item) => item.expiresAt > now);
  for (const item of expired) {
    try { await simplexChat.apiDeleteChatItems("direct", item.contactId, [item.itemId], "internal"); }
    catch { keep.push({ ...item, expiresAt: now + 60 * 60 * 1000 }); }
  }
  state.deletionQueue = keep;
  await saveState();
}

async function handleBotMessage(item, content) {
  await scheduleDeletion(item, simplexChat);
  const contactId = contactIdFromChatItem(item);
  const text = typeof content?.text === "string" ? content.text.trim() : "";
  if (!contactId || !text) return;

  const linkCommand = text.match(/^\/link\s+([A-Za-z0-9_-]{16,80})$/);
  if (linkCommand) {
    const pending = state.links[linkCommand[1]];
    if (!pending || pending.expiresAt <= Date.now() || pending.usedAt) {
      await simplexChat.apiSendTextReply(item, "That link code is invalid or expired. Create a fresh code in AspirantsConnect.");
      return;
    }
    state.contacts[pending.userId] = { contactId };
    pending.usedAt = Date.now();
    await saveState();
    await notifyApp("/api/simplex/account-linked", { userId: pending.userId, linked: true });
    await simplexChat.apiSendTextReply(item, "Your SimpleX account is linked. Use /to @username message to send a message to another ConceptNichod student.");
    return;
  }

  const linkedUserId = Object.entries(state.contacts).find(([, contact]) => contact.contactId === contactId)?.[0];
  if (!linkedUserId) {
    await simplexChat.apiSendTextReply(item, "Sign in to ConceptNichod, choose Connect SimpleX in AspirantsConnect, then send the one-time /link code here.");
    return;
  }
  const routed = text.match(/^\/to\s+@?([a-z0-9_.-]{1,32})\s+([\s\S]{1,4000})$/i);
  if (!routed) {
    await simplexChat.apiSendTextReply(item, "To send a message, use: /to @username your message");
    return;
  }
  const messageId = createHash("sha256").update(`${contactId}:${chatItemId(item) || text}`).digest("hex").slice(0, 24);
  await notifyApp("/api/simplex/incoming", { senderId: linkedUserId, recipientUsername: routed[1], body: routed[2].trim(), bridgeMessageId: messageId, createdAt: new Date().toISOString() });
  await simplexChat.apiSendTextReply(item, "Message delivered to the student's ConceptNichod inbox.");
}

const [chat, user] = await bot.run({
  profile: { displayName: process.env.SIMPLEX_BOT_DISPLAY_NAME || "ConceptNichod", fullName: "" },
  dbOpts: { type: "sqlite", filePrefix: join(dataDir, "simplex"), encryptionKey: simplexDbKey },
  options: {
    addressSettings: { autoAccept: true, welcomeMessage: "Link your ConceptNichod account with a one-time code from AspirantsConnect." },
    logContacts: false,
    logNetwork: false,
  },
  onMessage: handleBotMessage,
});
simplexChat = chat;
simplexUser = user;
await saveState();

async function handleRequest(request, response) {
  if (request.method === "GET" && request.url === "/health") return sendJson(response, 200, { ok: true });
  if (request.method !== "POST" || !request.url?.startsWith("/v1/")) return sendJson(response, 404, { error: "Not found" });
  if (!authorize(request)) return sendJson(response, 401, { error: "Unauthorized" });
  let payload;
  try { payload = await readJson(request); }
  catch (error) { return sendJson(response, error.status || 400, { error: error.message }); }

  if (request.url === "/v1/account-links") {
    if (typeof payload.userId !== "string" || !userUuidPattern.test(payload.userId)) return sendJson(response, 400, { error: "Invalid user" });
    if (Object.hasOwn(state.contacts, payload.userId)) return sendJson(response, 409, { error: "Account is already linked" });
    const linkCode = randomBytes(18).toString("base64url");
    const contactLink = await simplexChat.apiCreateLink(simplexUser.userId);
    state.links[linkCode] = { userId: payload.userId, expiresAt: Date.now() + 5 * 60 * 1000 };
    await saveState();
    return sendJson(response, 200, { contactLink, linkCode });
  }

  if (request.url === "/v1/conversations") {
    if (typeof payload.conversationId !== "string" || !Array.isArray(payload.participantIds) || payload.participantIds.length !== 2 || payload.participantIds.some((id) => typeof id !== "string" || !userUuidPattern.test(id))) return sendJson(response, 400, { error: "Invalid conversation" });
    const participantIds = [...payload.participantIds].sort();
    if (!participantIds.every((id) => Object.hasOwn(state.contacts, id))) return sendJson(response, 409, { error: "Both users must link SimpleX first" });
    state.conversations[payload.conversationId] = participantIds;
    await saveState();
    return sendJson(response, 200, { simplexConversationId: payload.conversationId });
  }

  if (request.url === "/v1/messages") {
    const { messageId, conversationId, senderId, senderUsername, recipientId, body, expiresAt } = payload;
    if (typeof messageId !== "string" || !messageIdPattern.test(messageId) || typeof conversationId !== "string" || typeof senderId !== "string" || typeof recipientId !== "string" || typeof senderUsername !== "string" || typeof body !== "string" || typeof expiresAt !== "string") return sendJson(response, 400, { error: "Invalid message" });
    const expiry = Date.parse(expiresAt);
    const participants = state.conversations[conversationId];
    if (!participants || !participants.includes(senderId) || !participants.includes(recipientId) || senderId === recipientId || !state.contacts[recipientId] || body.length < 1 || body.length > 4000 || !Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + 24 * 60 * 60 * 1000 + 60_000) return sendJson(response, 400, { error: "Message not authorized or expired" });
    if (state.delivered[messageId]) return sendJson(response, 200, { accepted: true, duplicate: true });
    const safeUsername = senderUsername.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 32) || "Student";
    const contactId = state.contacts[recipientId].contactId;
    const sentItems = await simplexChat.apiSendTextMessage(["direct", contactId], `@${safeUsername}: ${body}`);
    state.delivered[messageId] = expiry;
    for (const sentItem of sentItems || []) await scheduleDeletion(sentItem, simplexChat);
    await saveState();
    return sendJson(response, 200, { accepted: true });
  }

  return sendJson(response, 404, { error: "Not found" });
}

const server = createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error("Bridge request failed:", error?.message || "unknown error");
    if (!response.headersSent) sendJson(response, 500, { error: "Bridge request failed" });
  });
});
server.listen(port, host, () => console.log(`SimpleX bridge listening on ${host}:${port}`));
setInterval(() => { void sweepExpiredMessages().catch((error) => console.error("Retention sweep failed:", error?.message || "unknown error")); }, 60_000).unref();
