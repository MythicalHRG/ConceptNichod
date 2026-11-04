"use server";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import Blacklist from "@/models/Blacklist";
import Topic from "@/models/Topic";

const ADMIN_USERNAME = "mythicalhrg";

async function verifyAdmin() {
  await dbConnect();
  const sessionUuid = cookies().get("user_session")?.value;
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
