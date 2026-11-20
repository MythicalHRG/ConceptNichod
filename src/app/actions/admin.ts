"use server";

import mongoose from "mongoose";
import {
  isPlatformOwner,
  PLATFORM_OWNER_EMAIL,
  PLATFORM_OWNER_USERNAME,
} from "@/lib/owner-access";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import Blacklist from "@/models/Blacklist";
import Topic from "@/models/Topic";
import ConceptMirror from "@/models/ConceptMirror";
import MistakeEntry from "@/models/MistakeEntry";
import StudyStreak from "@/models/StudyStreak";
import NotificationRead from "@/models/NotificationRead";
import OtpVerification from "@/models/OtpVerification";
import GroupMessage from "@/models/GroupMessage";
import DirectMessage from "@/models/DirectMessage";
import Donor from "@/models/Donor";
import DonationTransaction from "@/models/DonationTransaction";
import StudyGroup from "@/models/StudyGroup";
import { verifySessionCookie } from "@/lib/session";
import { normalizeEmail } from "@/lib/email-utils";
import { sanitizeIp } from "@/lib/ip";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildCanonicalEmailFilter(email: string): Record<string, unknown> {
  const lower = email.trim().toLowerCase();
  const canonical = normalizeEmail(lower);
  const clauses: Record<string, unknown>[] = [
    { email: { $regex: new RegExp(`^${escapeRegex(lower)}$`, "i") } },
    { email: { $regex: new RegExp(`^${escapeRegex(canonical)}$`, "i") } },
  ];
  const atIndex = canonical.lastIndexOf("@");
  if (atIndex > 0) {
    const local = canonical.slice(0, atIndex);
    const domain = canonical.slice(atIndex + 1);
    if ((domain === "gmail.com" || domain === "googlemail.com") && local.length <= 64) {
      const dotInsensitive = local.split("").map(escapeRegex).join("\\.?");
      clauses.push({ email: { $regex: new RegExp(`^${dotInsensitive}@(gmail|googlemail)\\.com$`, "i") } });
    }
  }
  return { $or: clauses };
}

async function verifyOwner() {
  await dbConnect();
  const rawSession = (await cookies()).get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) throw new Error("Not authenticated");

  const user = await User.findOne({ uuid: sessionUuid })
    .select("uuid username email role")
    .lean();
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
  const users = await User.find({}).select("-password").sort({ createdAt: -1 }).limit(1000).lean();
  return { success: true, users: JSON.parse(JSON.stringify(users)) };
}

export async function deleteUserAction(uuid: string) {
  await verifyOwner();

  if (typeof uuid !== "string" || !uuid.trim()) {
    throw new Error("Target user UUID is required.");
  }
  const cleanUuid = uuid.trim();

  // Protect admin from self-deletion
  const userToDelete = await User.findOne({ uuid }).select("username email role").lean();
  if (isPlatformOwner(userToDelete)) {
    throw new Error("Cannot delete the platform owner account.");
  }

  const ownedGroups = await StudyGroup.find({ ownerId: cleanUuid }).select("_id").lean();
  const ownedGroupIds = ownedGroups.map((g) => String(g._id));

  const cleanupTasks: Promise<unknown>[] = [
    Topic.deleteMany({ userId: cleanUuid }),
    ConceptMirror.deleteMany({ userId: cleanUuid }),
    MistakeEntry.deleteMany({ userId: cleanUuid }),
    StudyStreak.deleteMany({ userId: cleanUuid }),
    NotificationRead.deleteMany({ userId: cleanUuid }),
    StudyGroup.deleteMany({ ownerId: cleanUuid }),
    StudyGroup.updateMany({ memberIds: cleanUuid }, { $pull: { memberIds: cleanUuid } }),
    GroupMessage.deleteMany(
      ownedGroupIds.length > 0
        ? { $or: [{ senderId: cleanUuid }, { groupId: { $in: ownedGroupIds } }] }
        : { senderId: cleanUuid }
    ),
    DirectMessage.deleteMany({ participantIds: cleanUuid }),
  ];

  if (userToDelete?.email) {
    const emailCandidates = Array.from(
      new Set([userToDelete.email.toLowerCase().trim(), normalizeEmail(userToDelete.email)].filter(Boolean))
    );
    if (emailCandidates.length > 0) {
      cleanupTasks.push(OtpVerification.deleteMany({ email: { $in: emailCandidates } }));
    }
  }

  await Promise.all(cleanupTasks);
  await User.deleteOne({ uuid: cleanUuid });

  return { success: true };
}

export async function banEntityAction(type: "ip" | "email" | "username", value: string, reason?: string) {
  await verifyOwner();
  if (!["ip", "email", "username"].includes(type) || typeof value !== "string" || !value.trim() || value.trim().length > 320) {
    throw new Error("A valid ban type and value are required.");
  }
  const normalizedValue =
    type === "ip"
      ? sanitizeIp(value.trim())
      : type === "email"
        ? normalizeEmail(value.trim())
        : value.trim().toLowerCase();

  // Unconditionally guard platform owner username & canonical email
  if (
    (type === "username" && normalizedValue === PLATFORM_OWNER_USERNAME) ||
    (type === "email" && (normalizedValue === PLATFORM_OWNER_EMAIL || normalizedValue === normalizeEmail(PLATFORM_OWNER_EMAIL)))
  ) {
    throw new Error("Cannot ban the platform owner account or its current IP address.");
  }

  const rawLowerValue = value.trim().toLowerCase();
  const targetMatcher = type === "ip"
    ? { $or: [{ firstLoginIp: normalizedValue }, { lastLoginIp: normalizedValue }, { lastKnownIp: normalizedValue }] }
    : type === "email"
      ? buildCanonicalEmailFilter(rawLowerValue)
      : { username: { $regex: new RegExp(`^${escapeRegex(normalizedValue)}$`, "i") } };

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
    await Blacklist.create({
      type,
      value: normalizedValue,
      reason: typeof reason === "string" ? reason.trim().slice(0, 500) : undefined,
    });
    return { success: true };
  } catch (e: any) {
    if (e?.code === 11000) {
      throw new Error("This entity is already banned.");
    }
    throw new Error("Failed to ban entity");
  }
}

export async function unbanEntityAction(id: string) {
  await verifyOwner();
  if (typeof id !== "string" || !mongoose.isValidObjectId(id)) {
    throw new Error("Invalid ban record ID.");
  }
  await Blacklist.findByIdAndDelete(id);
  return { success: true };
}

export async function getBansAction() {
  await verifyOwner();
  const bans = await Blacklist.find({}).sort({ createdAt: -1 }).limit(1000).lean();
  return { success: true, bans: JSON.parse(JSON.stringify(bans)) };
}

export async function updateUserCredentialsAction(params: {
  targetUuid: string;
  newUsername?: string;
  newEmail?: string;
}) {
  const ownerUser = await verifyOwner();
  if (!isPlatformOwner(ownerUser)) {
    throw new Error("Unauthorized: Only the platform owner can modify user credentials.");
  }

  if (!params || typeof params !== "object") {
    throw new Error("Invalid credential update payload.");
  }

  const { targetUuid, newUsername, newEmail } = params;
  if (typeof targetUuid !== "string" || !targetUuid.trim()) {
    throw new Error("Target user UUID is required.");
  }
  const cleanTargetUuid = targetUuid.trim();

  const targetUser = await User.findOne({ uuid: cleanTargetUuid });
  if (!targetUser) {
    throw new Error("Target user not found.");
  }

  let usernameChanged = false;
  let emailChanged = false;
  const targetIsOwner = isPlatformOwner(targetUser);

  // Validate and handle username update
  if (newUsername !== undefined) {
    if (typeof newUsername !== "string") {
      throw new Error("Username must be a string.");
    }
    const trimmedUsername = newUsername.trim();
    const validUsername = /^[a-zA-Z0-9_.]+$/;
    if (!validUsername.test(trimmedUsername) || trimmedUsername.length < 3 || trimmedUsername.length > 30) {
      throw new Error("Username must be 3-30 characters and contain only letters, numbers, underscores (_), and periods (.).");
    }

    if (trimmedUsername.toLowerCase() === PLATFORM_OWNER_USERNAME.toLowerCase() && targetUser.username.toLowerCase() !== PLATFORM_OWNER_USERNAME.toLowerCase()) {
      throw new Error(`Username "${PLATFORM_OWNER_USERNAME}" is reserved for the platform owner.`);
    }

    if ((targetIsOwner || targetUser.username.toLowerCase() === PLATFORM_OWNER_USERNAME.toLowerCase()) && trimmedUsername.toLowerCase() !== PLATFORM_OWNER_USERNAME.toLowerCase()) {
      throw new Error(`The root platform owner username "${PLATFORM_OWNER_USERNAME}" cannot be changed.`);
    }

    // Escape regex metacharacters (dots are permitted in usernames)
    const collision = await User.findOne({
      username: { $regex: new RegExp(`^${escapeRegex(trimmedUsername)}$`, "i") },
      uuid: { $ne: cleanTargetUuid },
    }).select("_id").lean();

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
    if (typeof newEmail !== "string") {
      throw new Error("Email must be a string.");
    }
    const trimmedEmail = newEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail) || trimmedEmail.length > 254) {
      throw new Error("Invalid email address format.");
    }

    const canonicalNewEmail = normalizeEmail(trimmedEmail);
    const canonicalOwnerEmail = normalizeEmail(PLATFORM_OWNER_EMAIL);
    if (targetIsOwner && canonicalNewEmail !== canonicalOwnerEmail) {
      throw new Error("The root platform owner email cannot be changed.");
    }
    if (!targetIsOwner && (trimmedEmail === PLATFORM_OWNER_EMAIL || canonicalNewEmail === canonicalOwnerEmail)) {
      throw new Error("This email is reserved for the platform owner.");
    }

    // Check case-insensitive & Gmail dot-variant collision with another user
    const collision = await User.findOne({
      ...buildCanonicalEmailFilter(trimmedEmail),
      uuid: { $ne: cleanTargetUuid },
    }).select("_id").lean();

    if (collision) {
      throw new Error(`Email "${trimmedEmail}" is already registered to another account.`);
    }

    if (targetUser.email.toLowerCase() !== trimmedEmail) {
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

  try {
    await targetUser.save();
  } catch (err: any) {
    if (err?.code === 11000) {
      throw new Error("The requested username or email is already in use by another account.");
    }
    throw new Error("Failed to update user credentials.");
  }

  // Cascade username update across chats and donation records by immutable user UUID
  if (usernameChanged) {
    await Promise.allSettled([
      GroupMessage.updateMany({ senderId: cleanTargetUuid }, { $set: { senderUsername: targetUser.username } }),
      DirectMessage.updateMany({ senderId: cleanTargetUuid }, { $set: { senderUsername: targetUser.username } }),
      Donor.updateMany(
        { $or: [{ userId: cleanTargetUuid }, { userUuid: cleanTargetUuid }] },
        { $set: { username: targetUser.username } }
      ),
      DonationTransaction.updateMany(
        { $or: [{ userId: cleanTargetUuid }, { userUuid: cleanTargetUuid }] },
        { $set: { username: targetUser.username } }
      ),
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

  const groups = await StudyGroup.find({}).sort({ createdAt: -1 }).limit(500).lean();

  const ownerIds = Array.from(new Set(groups.map((g) => g.ownerId)));
  const groupIds = groups.map((g) => g._id.toString());

  const [owners, messageCounts] = await Promise.all([
    ownerIds.length > 0
      ? User.find({ uuid: { $in: ownerIds } })
          .select("uuid username fullName email")
          .lean()
      : Promise.resolve([]),
    groupIds.length > 0
      ? GroupMessage.aggregate([
          { $match: { groupId: { $in: groupIds } } },
          { $group: { _id: "$groupId", count: { $sum: 1 } } },
        ])
      : Promise.resolve([]),
  ]);

  const ownerMap = new Map(owners.map((o) => [o.uuid, o]));
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
  if (!isPlatformOwner(owner)) {
    throw new Error("Forbidden: Only @mythicalhrg can delete study groups.");
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
    message: `Study group "${groupName}" and all associated messages have been deleted.`,
  };
}
