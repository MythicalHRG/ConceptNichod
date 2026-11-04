"use server";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import Broadcast from "@/models/Broadcast";
import NotificationRead from "@/models/NotificationRead";
import { verifySessionCookie } from "@/lib/session";

const ADMIN_USERNAME = "mythicalhrg";

async function verifyAdmin() {
  await dbConnect();
  const rawSession = cookies().get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) throw new Error("Not authenticated");

  const user = await User.findOne({ uuid: sessionUuid }).lean();
  if (!user || user.username !== ADMIN_USERNAME) {
    throw new Error("Forbidden: Admin access only");
  }
}

export async function createBroadcastAction(formData: FormData) {
  await verifyAdmin();
  
  const subject = formData.get("subject") as string;
  const message = formData.get("message") as string;
  const fileUrl = formData.get("fileUrl") as string | null;
  
  if (!subject || !message) {
    throw new Error("Missing subject or message");
  }

  // Adjustable expiration time (defaults to 36 hours)
  const expiryHours = parseFloat(formData.get("expiryHours") as string) || 36;
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

  await Broadcast.create({
    subject,
    message,
    fileUrl: fileUrl || undefined,
    expiresAt
  });

  return { success: true };
}

export async function getActiveBroadcastsAction() {
  await dbConnect();
  const rawSession = cookies().get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) throw new Error("Not authenticated");

  // Fetch all broadcasts that have not expired yet
  const broadcasts = await Broadcast.find({ expiresAt: { $gt: new Date() } })
    .sort({ createdAt: -1 })
    .lean();

  return { success: true, broadcasts: JSON.parse(JSON.stringify(broadcasts)) };
}

export async function markBroadcastsAsReadAction() {
  await dbConnect();
  const rawSession = cookies().get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) throw new Error("Not authenticated");

  await NotificationRead.findOneAndUpdate(
    { userId: sessionUuid },
    { lastReadAt: new Date() },
    { upsert: true, new: true }
  );

  return { success: true };
}

export async function getUnreadCountAction() {
  await dbConnect();
  const rawSession = cookies().get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) return { success: true, count: 0 };

  const readState = await NotificationRead.findOne({ userId: sessionUuid }).lean();
  const lastReadAt = readState?.lastReadAt || new Date(0); // If never read, consider all as unread

  // Count active broadcasts created AFTER the user last opened the bell
  const count = await Broadcast.countDocuments({
    expiresAt: { $gt: new Date() },
    createdAt: { $gt: lastReadAt }
  });

  return { success: true, count };
}

export async function deleteBroadcastAction(id: string) {
  await verifyAdmin();
  await Broadcast.findByIdAndDelete(id);
  return { success: true };
}
