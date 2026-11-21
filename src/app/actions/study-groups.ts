"use server";

import mongoose from "mongoose";
import { isPlatformOwner } from "@/lib/owner-access";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import StudyGroup from "@/models/StudyGroup";
import GroupMessage from "@/models/GroupMessage";
import DirectMessage from "@/models/DirectMessage";
import { verifySessionCookie } from "@/lib/session";
import { checkDistributedRateLimit } from "@/lib/distributed-rate-limiter";
import { assertActiveNonBlacklistedUser } from "@/lib/ai-flow-auth";
import { recordUserStudyActivity } from "@/lib/streak";

const MAX_GROUP_MEMBERS = 500;

function escapeHtml(str: string): string {
  return (typeof str === "string" ? str : "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getAuthenticatedUser() {
  await dbConnect();
  const rawSession = (await cookies()).get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) {
    throw new Error("Authentication required.");
  }
  await assertActiveNonBlacklistedUser(sessionUuid);
  const user = await User.findOne({ uuid: sessionUuid })
    .select("uuid username fullName email role")
    .lean();
  if (!user) {
    throw new Error("User account not found.");
  }
  return user;
}

export async function getStudyGroupsDataAction() {
  const user = await getAuthenticatedUser();

  // Find groups user is a member of
  const myGroupsDocs = await StudyGroup.find({ memberIds: user.uuid })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  // Find discoverable public groups user is NOT a member of
  const discoverGroupsDocs = await StudyGroup.find({ memberIds: { $ne: user.uuid } })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  // Get owner info
  const allOwnerIds = Array.from(
    new Set([...myGroupsDocs, ...discoverGroupsDocs].map((g) => g.ownerId))
  );
  const owners =
    allOwnerIds.length > 0
      ? await User.find({ uuid: { $in: allOwnerIds } })
          .select("uuid username fullName")
          .lean()
      : [];
  const ownerMap = new Map(owners.map((o) => [o.uuid, o]));

  const formatGroup = (g: any) => ({
    id: g._id.toString(),
    name: g.name,
    description: g.description,
    subject: g.subject,
    examFocus: g.examFocus || "General",
    schedule: g.schedule || "Flexible",
    memberCount: (g.memberIds || []).length,
    isOwner: g.ownerId === user.uuid,
    isMember: (g.memberIds || []).includes(user.uuid),
    ownerUsername: ownerMap.get(g.ownerId)?.username || "Student",
    createdAt: g.createdAt ? new Date(g.createdAt).toISOString() : new Date().toISOString(),
  });

  return {
    currentUser: {
      uuid: user.uuid,
      username: user.username,
      fullName: user.fullName,
    },
    myGroups: myGroupsDocs.map(formatGroup),
    discoverGroups: discoverGroupsDocs.map(formatGroup),
  };
}

export async function createStudyGroupAction(input: {
  name: string;
  description: string;
  subject: string;
  examFocus?: string;
  schedule?: string;
}) {
  const user = await getAuthenticatedUser();

  const rateCheck = await checkDistributedRateLimit(`group-create:${user.uuid}`, 5, 3600000);
  if (!rateCheck.success) {
    throw new Error("You have reached the limit for creating groups (5/hr). Please try again later.");
  }

  if (!input || typeof input !== "object") {
    throw new Error("Group name, description, and subject are required.");
  }

  const name = escapeHtml(typeof input.name === "string" ? input.name.trim() : "").slice(0, 100);
  const description = escapeHtml(typeof input.description === "string" ? input.description.trim() : "").slice(0, 1000);
  const subject = escapeHtml(typeof input.subject === "string" ? input.subject.trim() : "").slice(0, 80);
  const examFocus = escapeHtml(typeof input.examFocus === "string" ? input.examFocus.trim() : "").slice(0, 80);
  const schedule = escapeHtml(typeof input.schedule === "string" ? input.schedule.trim() : "").slice(0, 160);

  if (!name || !description || !subject) {
    throw new Error("Group name, description, and subject are required.");
  }

  // Server timestamp strictly
  const serverNow = new Date();

  const group = new StudyGroup({
    name,
    description,
    subject,
    examFocus,
    schedule,
    ownerId: user.uuid,
    memberIds: [user.uuid],
    createdAt: serverNow,
  });

  await group.save();
  await recordUserStudyActivity(user.uuid);

  return {
    success: true,
    groupId: group._id.toString(),
  };
}

export async function joinStudyGroupAction(groupId: string) {
  const user = await getAuthenticatedUser();

  if (typeof groupId !== "string" || !mongoose.isValidObjectId(groupId)) {
    throw new Error("Invalid study group ID.");
  }

  const rateCheck = await checkDistributedRateLimit(`group-join:${user.uuid}`, 30, 60000);
  if (!rateCheck.success) {
    throw new Error("Too many group join requests. Please wait a moment.");
  }

  const existing = await StudyGroup.findById(groupId).select("memberIds").lean();
  if (!existing) throw new Error("Study group not found.");

  if (!existing.memberIds?.includes(user.uuid)) {
    if ((existing.memberIds?.length || 0) >= MAX_GROUP_MEMBERS) {
      throw new Error("This study group has reached its maximum member capacity.");
    }
    const updated = await StudyGroup.findOneAndUpdate(
      {
        _id: groupId,
        $expr: { $lt: [{ $size: { $ifNull: ["$memberIds", []] } }, MAX_GROUP_MEMBERS] },
      },
      { $addToSet: { memberIds: user.uuid } },
      { new: true }
    ).select("_id").lean();
    if (!updated) {
      throw new Error("This study group has reached its maximum member capacity.");
    }
  }

  await recordUserStudyActivity(user.uuid);
  return { success: true };
}

export async function leaveStudyGroupAction(groupId: string) {
  const user = await getAuthenticatedUser();

  if (typeof groupId !== "string" || !mongoose.isValidObjectId(groupId)) {
    throw new Error("Invalid study group ID.");
  }

  const updated = await StudyGroup.findByIdAndUpdate(
    groupId,
    { $pull: { memberIds: user.uuid } },
    { new: true }
  ).select("_id").lean();
  if (!updated) throw new Error("Study group not found.");

  return { success: true };
}

export async function getGroupMessagesAction(groupId: string) {
  const user = await getAuthenticatedUser();

  if (typeof groupId !== "string" || !mongoose.isValidObjectId(groupId)) {
    throw new Error("Invalid study group ID.");
  }

  const group = await StudyGroup.findById(groupId).select("memberIds").lean();
  if (!group) throw new Error("Study group not found.");

  // IDOR Defense: Only authorized group members can read group conversations
  if (!group.memberIds || !group.memberIds.includes(user.uuid)) {
    throw new Error("You must join this study group to read messages.");
  }

  // Fetch the 100 MOST RECENT messages and reverse for chronological display
  const messagesDocs = (
    await GroupMessage.find({ groupId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
  ).reverse();

  return messagesDocs.map((m: any) => ({
    id: m._id.toString(),
    senderId: m.senderUsername,
    senderUsername: m.senderUsername,
    body: m.body,
    isMine: m.senderId === user.uuid,
    // Server time converted to standard ISO
    createdAt: new Date(m.createdAt).toISOString(),
    serverTimeMillis: new Date(m.createdAt).getTime(),
  }));
}

export async function sendGroupMessageAction(groupId: string, body: string) {
  const user = await getAuthenticatedUser();

  if (typeof groupId !== "string" || !mongoose.isValidObjectId(groupId)) {
    throw new Error("Invalid study group ID.");
  }

  const rateCheck = await checkDistributedRateLimit(`chat-msg:${user.uuid}`, 30, 60000);
  if (!rateCheck.success) {
    throw new Error("Slow down! You can send up to 30 messages per minute.");
  }

  const cleanBody = (typeof body === "string" ? body : "").trim();
  if (!cleanBody) throw new Error("Message cannot be empty.");
  if (cleanBody.length > 2000) throw new Error("Message is too long (maximum 2000 characters).");

  const safeBody = escapeHtml(cleanBody);
  if (safeBody.length > 2000) {
    throw new Error("Message is too long after encoding (maximum 2000 characters).");
  }

  const group = await StudyGroup.findById(groupId).select("memberIds").lean();
  if (!group) throw new Error("Study group not found.");

  // Membership is required before posting; sending a message must never grant access.
  if (!group.memberIds || !group.memberIds.includes(user.uuid)) {
    throw new Error("Join this study group before sending messages.");
  }

  // Strictly server time
  const serverTime = new Date();

  const msg = new GroupMessage({
    groupId,
    senderId: user.uuid,
    senderUsername: user.username,
    body: safeBody,
    createdAt: serverTime,
  });

  await msg.save();
  await recordUserStudyActivity(user.uuid);

  return {
    success: true,
    message: {
      id: msg._id.toString(),
      senderId: msg.senderUsername,
      senderUsername: msg.senderUsername,
      body: msg.body,
      isMine: true,
      createdAt: serverTime.toISOString(),
      serverTimeMillis: serverTime.getTime(),
    },
  };
}

export async function getDirectConversationsAction() {
  const user = await getAuthenticatedUser();

  // Find recent direct messages involving this user
  const recentDMs = await DirectMessage.find({ participantIds: user.uuid })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  // Distinct conversation keys
  const conversationsMap = new Map<string, any>();
  for (const dm of recentDMs) {
    if (!conversationsMap.has(dm.conversationKey)) {
      const otherId = dm.participantIds.find((id: string) => id !== user.uuid) || user.uuid;
      conversationsMap.set(dm.conversationKey, {
        conversationKey: dm.conversationKey,
        otherId,
        lastMessage: dm.body,
        lastMessageTime: new Date(dm.createdAt).toISOString(),
      });
    }
  }

  const otherUuids = Array.from(conversationsMap.values()).map((c) => c.otherId);
  const otherUsers =
    otherUuids.length > 0
      ? await User.find({ uuid: { $in: otherUuids } })
          .select("uuid username fullName classLevel examFocus city")
          .lean()
      : [];
  const userMap = new Map(otherUsers.map((u) => [u.uuid, u]));

  return Array.from(conversationsMap.values()).map((c) => {
    const peer = userMap.get(c.otherId);
    return {
      conversationKey: c.conversationKey,
      otherUsername: peer?.username || "Aspirant",
      otherFullName: peer?.fullName || "Fellow Aspirant",
      classLevel: peer?.classLevel || "",
      lastMessage: c.lastMessage,
      lastMessageTime: c.lastMessageTime,
    };
  });
}

export async function getDirectMessagesAction(targetUsername: string) {
  const user = await getAuthenticatedUser();

  const cleanTarget = typeof targetUsername === "string" ? targetUsername.trim() : "";
  if (!cleanTarget || cleanTarget.length > 40) {
    throw new Error("Aspirant not found.");
  }

  const target = await User.findOne({ username: new RegExp(`^${escapeRegex(cleanTarget)}$`, "i") })
    .select("uuid username fullName")
    .lean();
  if (!target) throw new Error("Aspirant not found.");

  const participantIds = [user.uuid, target.uuid].sort();
  const conversationKey = participantIds.join(":");

  // Fetch the 100 MOST RECENT direct messages and reverse for chronological display
  const messagesDocs = (
    await DirectMessage.find({ conversationKey })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
  ).reverse();

  return {
    target: {
      username: target.username,
      fullName: target.fullName,
    },
    messages: messagesDocs.map((m: any) => ({
      id: m._id.toString(),
      senderId: m.senderUsername,
      senderUsername: m.senderUsername,
      body: m.body,
      isMine: m.senderId === user.uuid,
      createdAt: new Date(m.createdAt).toISOString(),
      serverTimeMillis: new Date(m.createdAt).getTime(),
    })),
  };
}

export async function sendDirectMessageAction(targetUsername: string, body: string) {
  const user = await getAuthenticatedUser();

  const rateCheck = await checkDistributedRateLimit(`dm-msg:${user.uuid}`, 30, 60000);
  if (!rateCheck.success) {
    throw new Error("Slow down! You can send up to 30 messages per minute.");
  }

  const cleanTarget = typeof targetUsername === "string" ? targetUsername.trim() : "";
  if (!cleanTarget || cleanTarget.length > 40) {
    throw new Error("Recipient aspirant not found.");
  }

  const cleanBody = (typeof body === "string" ? body : "").trim();
  if (!cleanBody) throw new Error("Message cannot be empty.");
  if (cleanBody.length > 2000) throw new Error("Message is too long (maximum 2000 characters).");

  const safeBody = escapeHtml(cleanBody);
  if (safeBody.length > 2000) {
    throw new Error("Message is too long after encoding (maximum 2000 characters).");
  }

  const target = await User.findOne({ username: new RegExp(`^${escapeRegex(cleanTarget)}$`, "i") })
    .select("uuid username fullName")
    .lean();
  if (!target) throw new Error("Recipient aspirant not found.");
  if (target.uuid === user.uuid) {
    throw new Error("You cannot send direct messages to yourself.");
  }

  const participantIds = [user.uuid, target.uuid].sort();
  const conversationKey = participantIds.join(":");

  // Strictly server time
  const serverTime = new Date();

  const msg = new DirectMessage({
    conversationKey,
    participantIds,
    senderId: user.uuid,
    senderUsername: user.username,
    body: safeBody,
    createdAt: serverTime,
  });

  await msg.save();
  await recordUserStudyActivity(user.uuid);

  return {
    success: true,
    message: {
      id: msg._id.toString(),
      senderId: msg.senderUsername,
      senderUsername: msg.senderUsername,
      body: msg.body,
      isMine: true,
      createdAt: serverTime.toISOString(),
      serverTimeMillis: serverTime.getTime(),
    },
  };
}

export async function adminDeleteStudyGroupAction(groupId: string) {
  const user = await getAuthenticatedUser();
  if (!isPlatformOwner(user)) {
    throw new Error("Forbidden: Only @mythicalhrg is authorized to delete study groups.");
  }

  if (typeof groupId !== "string" || !mongoose.isValidObjectId(groupId)) {
    throw new Error("Valid Group ID is required.");
  }

  const group = await StudyGroup.findById(groupId).select("name").lean();
  if (!group) {
    throw new Error("Study group not found or already deleted.");
  }

  const groupName = group.name;

  await Promise.all([
    StudyGroup.findByIdAndDelete(groupId),
    GroupMessage.deleteMany({ groupId }),
  ]);

  return {
    success: true,
    message: `Study group "${groupName}" and all associated messages were deleted by admin.`,
  };
}
