"use server";

import { isPlatformOwner, PLATFORM_OWNER_EMAIL } from "@/lib/owner-access";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import Blacklist from "@/models/Blacklist";
import Topic from "@/models/Topic";
import GroupMessage from "@/models/GroupMessage";
import DirectMessage from "@/models/DirectMessage";
import Donor from "@/models/Donor";
import StudyGroup from "@/models/StudyGroup";
import { verifySessionCookie } from "@/lib/session";

const PLATFORM_OWNER_USERNAME = "mythicalhrg";

async function verifyOwner() {
  await dbConnect();
  const rawSession = (await cookies()).get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) throw new Error("Not authenticated");

  const user = await User.findOne({ uuid: sessionUuid });
  if (!isPlatformOwner(user)) {
    throw new Error("Forbidden: Admin access only");
  }

  // Authorization is based on the dedicated root account identity above.
  // Preserve the stored role (including "owner") instead of rewriting it
  // every time an admin action executes.
  return user;
}

export async function getAllUsersAction() {
  await verifyOwner();
  // Security: Exclude password hashes from serialization
  const users = await User.find({}).select("-password").sort({ createdAt: -1 }).lean();
  return { success: true, users: JSON.parse(JSON.stringify(users)) };
}

export async function deleteUserAction(uuid: string) {
  await verifyOwner();
  
  // Protect admin from self-deletion
  const userToDelete = await User.findOne({ uuid }).select("username email role").lean();
  if (isPlatformOwner(userToDelete)) {
    throw new Error("Cannot delete the platform owner account.");
  }

  await User.deleteOne({ uuid });
  await Topic.deleteMany({ userId: uuid });
  
  return { success: true };
}

export async function banEntityAction(type: "ip" | "email" | "username", value: string, reason?: string) {
  await verifyOwner();
  if (!["ip", "email", "username"].includes(type) || typeof value !== "string" || !value.trim() || value.trim().length > 320) {
    throw new Error("A valid ban type and value are required.");
  }
  const normalizedValue = value.trim().toLowerCase();
  const targetMatcher = type === "ip"
    ? { $or: [{ firstLoginIp: normalizedValue }, { lastLoginIp: normalizedValue }, { lastKnownIp: normalizedValue }] }
    : type === "email" ? { email: normalizedValue } : { username: normalizedValue };
  const ownerIdentity = await User.findOne({
    role: "owner",
    $and: [
      { $or: [{ username: PLATFORM_OWNER_USERNAME }, { email: PLATFORM_OWNER_EMAIL }] },
      targetMatcher,
    ],
  }).select("username email role").lean();
  if (isPlatformOwner(ownerIdentity)) {
    throw new Error("Cannot ban the platform owner account or its current IP address.");
  }

  try {
    await Blacklist.create({ type, value: normalizedValue, reason: typeof reason === "string" ? reason.trim().slice(0, 500) : undefined });
    return { success: true };
  } catch (e: any) {
    if (e.code === 11000) {
      throw new Error("This entity is already banned.");
    }
    throw new Error("Failed to ban entity");
  }
}

export async function unbanEntityAction(id: string) {
  await verifyOwner();
  await Blacklist.findByIdAndDelete(id);
  return { success: true };
}

export async function getBansAction() {
  await verifyOwner();
  const bans = await Blacklist.find({}).sort({ createdAt: -1 }).lean();
  return { success: true, bans: JSON.parse(JSON.stringify(bans)) };
}

export async function updateUserCredentialsAction(params: {
  targetUuid: string;
  newUsername?: string;
  newEmail?: string;
}) {
  const ownerUser = await verifyOwner();
  if (ownerUser.username !== PLATFORM_OWNER_USERNAME) {
    throw new Error("Unauthorized: Only the platform owner can modify user credentials.");
  }

  await dbConnect();

  const { targetUuid, newUsername, newEmail } = params;
  if (!targetUuid) {
    throw new Error("Target user UUID is required.");
  }

  const targetUser = await User.findOne({ uuid: targetUuid });
  if (!targetUser) {
    throw new Error("Target user not found.");
  }

  let usernameChanged = false;
  let emailChanged = false;
  const oldUsername = targetUser.username;

  // Validate and handle username update
  if (newUsername !== undefined) {
    const trimmedUsername = newUsername.trim();
    const validUsername = /^[a-zA-Z0-9_.]+$/;
    if (!validUsername.test(trimmedUsername) || trimmedUsername.length < 3 || trimmedUsername.length > 30) {
      throw new Error("Username must be 3-30 characters and contain only letters, numbers, underscores (_), and periods (.).");
    }

    if (trimmedUsername.toLowerCase() === PLATFORM_OWNER_USERNAME.toLowerCase() && targetUser.username.toLowerCase() !== PLATFORM_OWNER_USERNAME.toLowerCase()) {
      throw new Error(`Username "${PLATFORM_OWNER_USERNAME}" is reserved for the platform owner.`);
    }

    if (targetUser.username.toLowerCase() === PLATFORM_OWNER_USERNAME.toLowerCase() && trimmedUsername.toLowerCase() !== PLATFORM_OWNER_USERNAME.toLowerCase()) {
      throw new Error(`The root platform owner username "${PLATFORM_OWNER_USERNAME}" cannot be changed.`);
    }

    // Check collision with another user
    const collision = await User.findOne({
      username: { $regex: new RegExp(`^${trimmedUsername}$`, "i") },
      uuid: { $ne: targetUuid },
    }).lean();

    if (collision) {
      throw new Error(`Username "@${trimmedUsername}" is already taken by another account.`);
    }

    if (targetUser.username !== trimmedUsername) {
      targetUser.username = trimmedUsername;
      usernameChanged = true;
    }
  }

  // Validate and handle email update
  if (newEmail !== undefined) {
    const trimmedEmail = newEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      throw new Error("Invalid email address format.");
    }

    // Check collision with another user
    const collision = await User.findOne({
      email: trimmedEmail,
      uuid: { $ne: targetUuid },
    }).lean();

    if (collision) {
      throw new Error(`Email "${trimmedEmail}" is already registered to another account.`);
    }

    if (targetUser.email !== trimmedEmail) {
      targetUser.email = trimmedEmail;
      emailChanged = true;
    }
  }

  if (!usernameChanged && !emailChanged) {
    return {
      success: true,
      message: "No credential changes made.",
      user: {
        uuid: targetUser.uuid,
        username: targetUser.username,
        email: targetUser.email,
      },
    };
  }

  await targetUser.save();

  // Cascade username update across chats and donor cards
  if (usernameChanged) {
    await Promise.allSettled([
      GroupMessage.updateMany({ senderId: targetUuid }, { senderUsername: targetUser.username }),
      DirectMessage.updateMany({ senderId: targetUuid }, { senderUsername: targetUser.username }),
      Donor.updateMany({ username: oldUsername }, { username: targetUser.username }),
    ]);
  }

  return {
    success: true,
    message: "Credentials successfully updated.",
    user: {
      uuid: targetUser.uuid,
      username: targetUser.username,
      email: targetUser.email,
    },
  };
}

export async function getAllStudyGroupsAdminAction() {
  await verifyOwner();
  await dbConnect();

  const groups = await StudyGroup.find({}).sort({ createdAt: -1 }).lean();

  const ownerIds = Array.from(new Set(groups.map((g) => g.ownerId)));
  const owners = await User.find({ uuid: { $in: ownerIds } })
    .select("uuid username fullName email")
    .lean();
  const ownerMap = new Map(owners.map((o) => [o.uuid, o]));

  const messageCounts = await GroupMessage.aggregate([
    { $group: { _id: "$groupId", count: { $sum: 1 } } },
  ]);
  const countMap = new Map(messageCounts.map((m: any) => [m._id ? m._id.toString() : "", m.count]));

  return {
    success: true,
    groups: groups.map((g: any) => ({
      id: g._id.toString(),
      name: g.name,
      description: g.description,
      subject: g.subject,
      examFocus: g.examFocus || "General",
      schedule: g.schedule || "Flexible",
      ownerId: g.ownerId,
      ownerUsername: ownerMap.get(g.ownerId)?.username || "Unknown",
      ownerFullName: ownerMap.get(g.ownerId)?.fullName || "Unknown Aspirant",
      ownerEmail: ownerMap.get(g.ownerId)?.email || "",
      memberCount: (g.memberIds || []).length,
      messageCount: countMap.get(g._id.toString()) || 0,
      createdAt: g.createdAt ? new Date(g.createdAt).toISOString() : new Date().toISOString(),
    })),
  };
}

export async function deleteStudyGroupAdminAction(groupId: string) {
  const owner = await verifyOwner();
  if (owner.username !== PLATFORM_OWNER_USERNAME) {
    throw new Error("Forbidden: Only @mythicalhrg can delete study groups.");
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
    message: `Study group "${groupName}" and all associated messages have been deleted.`,
  };
}
