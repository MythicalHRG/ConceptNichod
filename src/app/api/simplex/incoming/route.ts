import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongoose";
import { encryptChatBody } from "@/lib/chat-crypto";
import { verifySimplexWebhookSecret } from "@/lib/simplex-bridge";
import { enforcePersistentRateLimit } from "@/lib/persistent-rate-limit";
import ChatConversation from "@/models/ChatConversation";
import ChatMessage from "@/models/ChatMessage";
import User from "@/models/User";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] || null;
  if (!verifySimplexWebhookSecret(token)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await request.text();
  if (raw.length > 12_000) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  let payload: { senderId?: unknown; recipientUsername?: unknown; body?: unknown; bridgeMessageId?: unknown; createdAt?: unknown };
  try { payload = JSON.parse(raw); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (typeof payload.senderId !== "string" || typeof payload.recipientUsername !== "string" || typeof payload.body !== "string" || typeof payload.bridgeMessageId !== "string") return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const body = payload.body.trim();
  const bridgeMessageId = payload.bridgeMessageId.slice(0, 100);
  const createdAt = payload.createdAt ? new Date(String(payload.createdAt)) : new Date();
  if (!mongoose.isValidObjectId(bridgeMessageId) || !body || body.length > 4000 || Number.isNaN(createdAt.getTime()) || createdAt.getTime() > Date.now() + 2 * 60 * 1000 || createdAt.getTime() < Date.now() - 24 * 60 * 60 * 1000) return NextResponse.json({ error: "Invalid message" }, { status: 400 });

  await dbConnect();
  try { await enforcePersistentRateLimit(`simplex-incoming:${payload.senderId}`, 60, 60 * 60 * 1000); }
  catch { return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 }); }
  if (await ChatMessage.exists({ bridgeMessageId })) return NextResponse.json({ ok: true, duplicate: true });

  const [sender, recipient] = await Promise.all([
    User.findOne({ uuid: payload.senderId, simplexLinked: true }).select("uuid").lean(),
    User.findOne({ username: payload.recipientUsername.trim().replace(/^@/, "").toLowerCase(), allowIncomingMessages: { $ne: false } }).select("uuid").lean(),
  ]);
  if (!sender || !recipient || sender.uuid === recipient.uuid) return NextResponse.json({ error: "Recipient unavailable" }, { status: 404 });

  const participantIds = [sender.uuid, recipient.uuid].sort();
  const participantKey = participantIds.join(":");
  let conversation = await ChatConversation.findOne({ participantKey });
  if (!conversation) {
    try { conversation = await ChatConversation.create({ participantIds, participantKey }); }
    catch (error: any) {
      if (error?.code !== 11000) throw error;
      conversation = await ChatConversation.findOne({ participantKey });
    }
  }
  if (!conversation) return NextResponse.json({ error: "Could not create conversation" }, { status: 500 });
  const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
  try {
    await ChatMessage.create({ conversationId: conversation._id.toString(), senderId: sender.uuid, body: encryptChatBody(body, `${conversation._id}:${sender.uuid}`), bridgeMessageId, createdAt, expiresAt });
    conversation.updatedAt = createdAt;
    await conversation.save();
  } catch (error: any) {
    if (error?.code === 11000) return NextResponse.json({ ok: true, duplicate: true });
    throw error;
  }
  return NextResponse.json({ ok: true });
}
