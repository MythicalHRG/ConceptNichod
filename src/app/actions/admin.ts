"use server";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import Blacklist from "@/models/Blacklist";
import Topic from "@/models/Topic";
import GroupMessage from "@/models/GroupMessage";
import DirectMessage from "@/models/DirectMessage";
import Donor from "@/models/Donor";
import { verifySessionCookie } from "@/lib/session";

const ADMIN_USERNAME = "mythicalhrg";

async function verifyAdmin() {
  await dbConnect();
  const rawSession = cookies().get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) throw new Error("Not authenticated");

  const user = await User.findOne({ uuid: sessionUuid });
  if (!user || user.username !== ADMIN_USERNAME) {
    throw new Error("Forbidden: Admin access only");
  }

  // Ensure role is synchronized
  if (user.role !== "admin") {
    user.role = "admin";
    await user.save();
  }

  return user;
}

export async function getAllUsersAction() {
  await verifyAdmin();
  // Security: Exclude password hashes from serialization
  const users = await User.find({}).select("-password").sort({ createdAt: -1 }).lean();
  return { success: true, users: JSON.parse(JSON.stringify(users)) };
}

export async function deleteUserAction(uuid: string) {
  await verifyAdmin();
  
  // Protect admin from self-deletion
  const userToDelete = await User.findOne({ uuid }).lean();
  if (userToDelete && userToDelete.username === ADMIN_USERNAME) {
    throw new Error("Cannot delete admin account");
  }

  await User.deleteOne({ uuid });
  await Topic.deleteMany({ userId: uuid });
  
  return { success: true };
}

export async function banEntityAction(type: "ip" | "email" | "username", value: string, reason?: string) {
  await verifyAdmin();
  
  if (type === "username" && value.toLowerCase().trim() === ADMIN_USERNAME) {
    throw new Error("Cannot ban admin username");
  }

  try {
    await Blacklist.create({ type, value, reason });
    return { success: true };
  } catch (e: any) {
    if (e.code === 11000) {
      throw new Error("This entity is already banned.");
    }
    throw new Error("Failed to ban entity");
  }
}

export async function unbanEntityAction(id: string) {
  await verifyAdmin();
  await Blacklist.findByIdAndDelete(id);
  return { success: true };
}

export async function getBansAction() {
  await verifyAdmin();
  const bans = await Blacklist.find({}).sort({ createdAt: -1 }).lean();
  return { success: true, bans: JSON.parse(JSON.stringify(bans)) };
}

export async function updateUserCredentialsAction(params: {
  targetUuid: string;
  newUsername?: string;
  newEmail?: string;
}) {
  const adminUser = await verifyAdmin();
  if (adminUser.username !== ADMIN_USERNAME) {
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

    if (trimmedUsername.toLowerCase() === ADMIN_USERNAME.toLowerCase() && targetUser.username.toLowerCase() !== ADMIN_USERNAME.toLowerCase()) {
      throw new Error(`Username "${ADMIN_USERNAME}" is reserved for the platform owner.`);
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
