"use server";

import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import StudyGroup from "@/models/StudyGroup";
import GroupMessage from "@/models/GroupMessage";
import DirectMessage from "@/models/DirectMessage";
import { verifySessionCookie } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limiter";
import { recordUserStudyActivity } from "@/lib/streak";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function getAuthenticatedUser() {
  await dbConnect();
  const rawSession = cookies().get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) {
    throw new Error("Authentication required.");
  }
  const user = await User.findOne({ uuid: sessionUuid }).lean();
  if (!user) {
    throw new Error("User account not found.");
  }
  return user;
}

export async function getStudyGroupsDataAction() {
  const user = await getAuthenticatedUser();
  await dbConnect();

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
  const owners = await User.find({ uuid: { $in: allOwnerIds } })
    .select("uuid username fullName")
    .lean();
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

  const rateCheck = checkRateLimit(`group-create:${user.uuid}`, 5, 3600000);
  if (!rateCheck.success) {
    throw new Error("You have reached the limit for creating groups (5/hr). Please try again later.");
  }

  const name = (input.name || "").trim().slice(0, 100);
  const description = (input.description || "").trim().slice(0, 1000);
  const subject = (input.subject || "").trim().slice(0, 80);
  const examFocus = (input.examFocus || "").trim().slice(0, 80);
  const schedule = (input.schedule || "").trim().slice(0, 160);

  if (!name || !description || !subject) {
    throw new Error("Group name, description, and subject are required.");
  }

  // Server timestamp strictly
  const serverNow = new Date();

  const group = new StudyGroup({
    name: escapeHtml(name),
    description: escapeHtml(description),
    subject: escapeHtml(subject),
    examFocus: escapeHtml(examFocus),
    schedule: escapeHtml(schedule),
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
  await dbConnect();

  const group = await StudyGroup.findById(groupId);
  if (!group) throw new Error("Study group not found.");

  if (!group.memberIds.includes(user.uuid)) {
    group.memberIds.push(user.uuid);
    await group.save();
  }

  await recordUserStudyActivity(user.uuid);
  return { success: true };
}

export async function leaveStudyGroupAction(groupId: string) {
  const user = await getAuthenticatedUser();
  await dbConnect();

  const group = await StudyGroup.findById(groupId);
  if (!group) throw new Error("Study group not found.");

  group.memberIds = group.memberIds.filter((id) => id !== user.uuid);
  await group.save();

  return { success: true };
}

export async function getGroupMessagesAction(groupId: string) {
  const user = await getAuthenticatedUser();
  await dbConnect();

  const group = await StudyGroup.findById(groupId).lean();
  if (!group) throw new Error("Study group not found.");

  // IDOR Defense: Only authorized group members can read group conversations
  if (!group.memberIds || !group.memberIds.includes(user.uuid)) {
    throw new Error("You must join this study group to read messages.");
  }

  const messagesDocs = await GroupMessage.find({ groupId })
    .sort({ createdAt: 1 })
    .limit(100)
    .lean();

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

  const rateCheck = checkRateLimit(`chat-msg:${user.uuid}`, 30, 60000);
  if (!rateCheck.success) {
    throw new Error("Slow down! You can send up to 30 messages per minute.");
  }

  const cleanBody = (body || "").trim();
  if (!cleanBody) throw new Error("Message cannot be empty.");
  if (cleanBody.length > 2000) throw new Error("Message is too long (maximum 2000 characters).");

  await dbConnect();
  const group = await StudyGroup.findById(groupId);
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
    body: escapeHtml(cleanBody),
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
  await dbConnect();

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
  const otherUsers = await User.find({ uuid: { $in: otherUuids } })
    .select("uuid username fullName classLevel examFocus city")
    .lean();
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
  await dbConnect();

  const target = await User.findOne({ username: targetUsername.trim().toLowerCase() })
    .select("uuid username fullName")
    .lean();
  if (!target) throw new Error("Aspirant not found.");

  const participantIds = [user.uuid, target.uuid].sort();
  const conversationKey = participantIds.join(":");

  const messagesDocs = await DirectMessage.find({ conversationKey })
    .sort({ createdAt: 1 })
    .limit(100)
    .lean();

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

  const rateCheck = checkRateLimit(`dm-msg:${user.uuid}`, 30, 60000);
  if (!rateCheck.success) {
    throw new Error("Slow down! You can send up to 30 messages per minute.");
  }

  const cleanBody = (body || "").trim();
  if (!cleanBody) throw new Error("Message cannot be empty.");
  if (cleanBody.length > 2000) throw new Error("Message is too long (maximum 2000 characters).");

  await dbConnect();
  const target = await User.findOne({ username: targetUsername.trim().toLowerCase() })
    .select("uuid username fullName")
    .lean();
  if (!target) throw new Error("Recipient aspirant not found.");

  const participantIds = [user.uuid, target.uuid].sort();
  const conversationKey = participantIds.join(":");

  // Strictly server time
  const serverTime = new Date();

  const msg = new DirectMessage({
    conversationKey,
    participantIds,
    senderId: user.uuid,
    senderUsername: user.username,
    body: escapeHtml(cleanBody),
    createdAt: serverTime,
  });

  await msg.save();
  await recordUserStudyActivity(user.uuid);

  return {
    success: true,
    message: {
      id: msg._id.toString(),
      senderId: msg.senderId,
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
  if (user.username !== "mythicalhrg") {
    throw new Error("Forbidden: Only @mythicalhrg is authorized to delete study groups.");
  }

  if (!groupId) {
    throw new Error("Group ID is required.");
  }

  await dbConnect();
  const group = await StudyGroup.findById(groupId);
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
