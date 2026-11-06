"use server";

import mongoose from "mongoose";
import dbConnect from "@/lib/mongoose";
import { requireSessionUuid } from "@/lib/server-auth";
import User from "@/models/User";
import ChatConversation from "@/models/ChatConversation";
import ChatMessage from "@/models/ChatMessage";
import { sendEmail } from "@/services/email";
import { decryptChatBody, encryptChatBody } from "@/lib/chat-crypto";
import { enforcePersistentRateLimit } from "@/lib/persistent-rate-limit";
import { createSimplexAccountLink, createSimplexConversation, deliverSimplexMessage, isSimplexBridgeConfigured } from "@/lib/simplex-bridge";

const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

async function requireParticipant(conversationId: string, userId: string) {
  if (!mongoose.isValidObjectId(conversationId)) throw new Error("Invalid conversation.");
  const conversation = await ChatConversation.findOne({ _id: conversationId, participantIds: userId });
  if (!conversation) throw new Error("Conversation not found.");
  return conversation;
}

export async function startDirectChatAction(targetUsername: string) {
  const userId = requireSessionUuid();
  await dbConnect();
  await enforcePersistentRateLimit(`chat-start:${userId}`, 20, 60 * 60 * 1000);
  const [target, sender] = await Promise.all([
    User.findOne({ username: targetUsername.trim().toLowerCase() }).select("uuid username allowIncomingMessages simplexLinked").lean(),
    User.findOne({ uuid: userId }).select("simplexLinked username").lean(),
  ]);
  if (!target || target.uuid === userId) throw new Error("User not found.");
  if (!sender) throw new Error("Account not found.");
  if (target.allowIncomingMessages === false) throw new Error("This user is not accepting new messages.");
  const participantIds = [userId, target.uuid].sort();
  const participantKey = participantIds.join(":");
  let conversation = await ChatConversation.findOne({ participantKey });
  if (!conversation) {
    try {
      conversation = await ChatConversation.create({ participantIds, participantKey });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      conversation = await ChatConversation.findOne({ participantKey });
    }
  }
  if (!conversation) throw new Error("Could not create the conversation.");
  if (isSimplexBridgeConfigured() && sender.simplexLinked && target.simplexLinked && !conversation.simplexConversationId) {
    conversation.simplexConversationId = await createSimplexConversation(conversation._id.toString(), participantIds);
    await conversation.save();
  }
  return { id: conversation._id.toString(), username: target.username };
}

export async function getSimplexConnectionStatusAction() {
  const userId = requireSessionUuid();
  await dbConnect();
  const user = await User.findOne({ uuid: userId }).select("simplexLinked").lean();
  return { configured: isSimplexBridgeConfigured(), linked: user?.simplexLinked === true };
}

export async function createSimplexAccountLinkAction() {
  const userId = requireSessionUuid();
  await dbConnect();
  await enforcePersistentRateLimit(`simplex-link:${userId}`, 5, 60 * 60 * 1000);
  const result = await createSimplexAccountLink(userId);
  return { ...result, instructions: "Open the contact link in SimpleX Chat, then send /link followed by the one-time code to the ConceptNichod bot." };
}

export async function getChatInboxAction() {
  const userId = requireSessionUuid();
  await dbConnect();
  const conversations = await ChatConversation.find({ participantIds: userId }).sort({ updatedAt: -1 }).limit(100).lean();
  const otherIds = conversations.map((c) => c.participantIds.find((id) => id !== userId)).filter((id): id is string => Boolean(id));
  const [users, messages] = await Promise.all([
    User.find({ uuid: { $in: otherIds } }).select("uuid username fullName isDiscoverable").lean(),
    ChatMessage.find({ conversationId: { $in: conversations.map((c) => c._id.toString()) }, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).limit(1000).lean(),
  ]);
  const byId = new Map(users.map((u) => [u.uuid, { username: u.username, fullName: u.fullName, isDiscoverable: u.isDiscoverable }]));
  const lastByConversation = new Map<string, { body: string; createdAt: Date }>();
  for (const message of messages) {
    if (!lastByConversation.has(message.conversationId)) {
      lastByConversation.set(message.conversationId, { body: decryptChatBody(message.body, `${message.conversationId}:${message.senderId}`), createdAt: message.createdAt });
    }
  }
  return conversations.map((c) => ({ id: c._id.toString(), otherUser: byId.get(c.participantIds.find((id) => id !== userId) || "") || { username: "Unavailable" }, muted: c.mutedBy.includes(userId), closed: c.closedBy.includes(userId), lastMessage: lastByConversation.get(c._id.toString()) }));
}

export async function getChatMessagesAction(conversationId: string) {
  const userId = requireSessionUuid();
  await dbConnect();
  const conversation = await requireParticipant(conversationId, userId);
  const messages = await ChatMessage.find({ conversationId, expiresAt: { $gt: new Date() } }).sort({ createdAt: 1 }).limit(200).lean();
  const senders = await User.find({ uuid: { $in: [...new Set(messages.map((m) => m.senderId))] } }).select("uuid username fullName").lean();
  const senderMap = new Map(senders.map((u) => [u.uuid, { username: u.username, fullName: u.fullName }]));
  return { conversation: { id: conversation._id.toString(), muted: conversation.mutedBy.includes(userId), closed: conversation.closedBy.includes(userId) }, messages: messages.map((m) => ({ id: m._id.toString(), body: decryptChatBody(m.body, `${m.conversationId}:${m.senderId}`), createdAt: m.createdAt, expiresAt: m.expiresAt, relayStatus: m.relayStatus || "app-only", sender: senderMap.get(m.senderId) || { username: "Unavailable" }, mine: m.senderId === userId })) };
}

export async function sendChatMessageAction(conversationId: string, body: string) {
  const userId = requireSessionUuid();
  await dbConnect();
  await enforcePersistentRateLimit(`chat-send:${userId}`, 60, 60 * 1000);
  const conversation = await requireParticipant(conversationId, userId);
  if (conversation.closedBy.includes(userId)) throw new Error("Reopen this conversation before sending a message.");
  const message = typeof body === "string" ? body.trim() : "";
  if (!message || message.length > 4000) throw new Error("Messages must be between 1 and 4,000 characters.");
  const recipientId = conversation.participantIds.find((id) => id !== userId);
  if (!recipientId) throw new Error("Conversation recipient not found.");
  const [recipient, sender] = await Promise.all([
    User.findOne({ uuid: recipientId, allowIncomingMessages: { $ne: false } }).select("simplexLinked").lean(),
    User.findOne({ uuid: userId }).select("simplexLinked username").lean(),
  ]);
  if (!recipient) throw new Error("This user is not accepting incoming messages.");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const bridgeReady = isSimplexBridgeConfigured() && sender?.simplexLinked === true && recipient.simplexLinked === true;
  const saved = await ChatMessage.create({ conversationId, senderId: userId, body: encryptChatBody(message, `${conversationId}:${userId}`), expiresAt, relayStatus: "app-only" });
  if (bridgeReady) {
    try {
      if (!conversation.simplexConversationId) {
        conversation.simplexConversationId = await createSimplexConversation(conversationId, conversation.participantIds);
        await conversation.save();
      }
      await deliverSimplexMessage({ messageId: saved._id.toString(), conversationId, senderId: userId, senderUsername: sender?.username || "Student", recipientId, body: message, expiresAt: expiresAt.toISOString() });
      saved.relayStatus = "sent";
    } catch {
      saved.relayStatus = "failed";
    }
    await saved.save();
  }
  conversation.updatedAt = new Date();
  await conversation.save();
  return { id: saved._id.toString(), createdAt: saved.createdAt, expiresAt };
}

export async function updateChatPreferenceAction(conversationId: string, preference: "mute" | "close", enabled: boolean) {
  const userId = requireSessionUuid();
  await dbConnect();
  const conversation = await requireParticipant(conversationId, userId);
  const field = preference === "mute" ? "mutedBy" : "closedBy";
  if (enabled) {
    if (!conversation[field].includes(userId)) conversation[field].push(userId);
  } else conversation[field] = conversation[field].filter((id) => id !== userId);
  await conversation.save();
  return { success: true };
}

export async function reportChatAction(conversationId: string, reason: string, reporteeUsername: string) {
  const userId = requireSessionUuid();
  await dbConnect();
  await enforcePersistentRateLimit(`chat-report:${userId}`, 3, 60 * 60 * 1000);
  const conversation = await requireParticipant(conversationId, userId);
  const safeReporteeUsername = typeof reporteeUsername === "string" ? reporteeUsername.trim().toLowerCase() : "";
  const safeReasonText = typeof reason === "string" ? reason.trim().slice(0, 2000) : "";
  if (!safeReasonText) throw new Error("Add a reason for the report.");
  const reportee = await User.findOne({ username: safeReporteeUsername }).select("uuid username").lean();
  if (!reportee || !conversation.participantIds.includes(reportee.uuid) || reportee.uuid === userId) throw new Error("Reported user is not part of this conversation.");
  const reporter = await User.findOne({ uuid: userId }).select("username email").lean();
  const admin = await User.findOne({ $or: [{ role: "admin" }, { username: "mythicalhrg" }] }).select("email").lean();
  if (!admin?.email) throw new Error("The admin report address is not configured.");
  const messages = await ChatMessage.find({ conversationId, expiresAt: { $gt: new Date() } }).sort({ createdAt: 1 }).lean();
  const people = await User.find({ uuid: { $in: conversation.participantIds } }).select("uuid username").lean();
  const names = new Map(people.map((u) => [u.uuid, u.username]));
  const transcript = messages.map((m) => `<p><strong>${esc(names.get(m.senderId) || "User")} · ${esc(new Date(m.createdAt).toISOString())}</strong><br>${esc(decryptChatBody(m.body, `${m.conversationId}:${m.senderId}`)).replace(/\n/g, "<br>")}</p>`).join("");
  const safeReason = esc(safeReasonText);
  await sendEmail({
    to: admin.email,
    subject: `AspirantsConnect report: ${reportee.username}`,
    html: `<h2>Chat report</h2><p><strong>Reporter:</strong> ${esc(reporter?.username)} (${esc(reporter?.email)})</p><p><strong>Reported user:</strong> ${esc(reportee.username)}</p><p><strong>Reason:</strong> ${safeReason}</p><h3>Available conversation transcript</h3>${transcript || "<p>No unexpired messages were available.</p>"}`,
  });
  return { success: true };
}
