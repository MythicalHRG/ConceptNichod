"use server";

import mongoose from "mongoose";
import { isPlatformOwner } from "@/lib/owner-access";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import Broadcast from "@/models/Broadcast";
import NotificationRead from "@/models/NotificationRead";
import { verifySessionCookie } from "@/lib/session";
import { checkDistributedRateLimit } from "@/lib/distributed-rate-limiter";
import { UTApi } from "uploadthing/server";

const ALLOWED_ATTACHMENT_HOSTS = ["utfs.io", "uploadthing.com", "ufs.sh"];

function parseSafeUploadThingUrl(rawUrl: string): { url: string; fileKey: string } | null {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  try {
    const parsedUrl = new URL(trimmed);
    const isAllowedHost = ALLOWED_ATTACHMENT_HOSTS.some(
      (host) => parsedUrl.hostname === host || parsedUrl.hostname.endsWith(`.${host}`)
    );
    if (
      parsedUrl.protocol !== "https:" ||
      !isAllowedHost ||
      parsedUrl.username ||
      parsedUrl.password ||
      !parsedUrl.pathname.startsWith("/f/")
    ) {
      return null;
    }
    const candidateKey = parsedUrl.pathname.slice(3);
    if (
      !candidateKey ||
      candidateKey === "." ||
      candidateKey === ".." ||
      !/^[A-Za-z0-9._-]+$/.test(candidateKey)
    ) {
      return null;
    }
    return { url: parsedUrl.toString(), fileKey: candidateKey };
  } catch {
    return null;
  }
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
  return user;
}

export async function createBroadcastAction(formData: FormData) {
  const owner = await verifyOwner();

  if (!(formData instanceof FormData)) {
    throw new Error("Invalid broadcast submission.");
  }

  const rateCheck = await checkDistributedRateLimit(`broadcast:create:${owner.uuid}`, 20, 60 * 60 * 1000);
  if (!rateCheck.success) {
    throw new Error("Too many broadcasts created recently. Please wait before creating another.");
  }

  const rawSubject = formData.get("subject");
  const rawMessage = formData.get("message");
  const rawFileUrl = formData.get("fileUrl");
  const rawExpiry = formData.get("expiryHours");

  const subject = typeof rawSubject === "string" ? rawSubject.trim() : "";
  const message = typeof rawMessage === "string" ? rawMessage.trim() : "";

  if (!subject || !message) {
    throw new Error("Missing subject or message");
  }
  if (subject.length > 200 || message.length > 10000) {
    throw new Error("Subject or message exceeds maximum allowed length.");
  }

  let safeFileUrl: string | undefined;
  if (typeof rawFileUrl === "string" && rawFileUrl.trim().length > 0) {
    const parsedAttachment = parseSafeUploadThingUrl(rawFileUrl);
    if (!parsedAttachment) {
      throw new Error("Invalid attachment URL. Only HTTPS UploadThing attachment URLs are permitted.");
    }
    safeFileUrl = parsedAttachment.url;
  }

  // Adjustable expiration time (1 to 720 hours; defaults to 36 hours when omitted)
  let expiryHours = 36;
  if (typeof rawExpiry === "string" && rawExpiry.trim().length > 0) {
    const parsedHours = Number(rawExpiry.trim());
    if (!Number.isFinite(parsedHours) || parsedHours < 1 || parsedHours > 720) {
      throw new Error("Expiry duration must be between 1 and 720 hours.");
    }
    expiryHours = parsedHours;
  }
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

  await Broadcast.create({
    subject,
    message,
    fileUrl: safeFileUrl,
    expiresAt,
  });

  return { success: true };
}

export async function getActiveBroadcastsAction() {
  await dbConnect();
  const rawSession = (await cookies()).get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) throw new Error("Not authenticated");

  // Fetch active broadcasts that have not expired yet (bounded for safety)
  const broadcasts = await Broadcast.find({ expiresAt: { $gt: new Date() } })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return { success: true, broadcasts: JSON.parse(JSON.stringify(broadcasts)) };
}

export async function markBroadcastsAsReadAction() {
  await dbConnect();
  const rawSession = (await cookies()).get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) throw new Error("Not authenticated");

  await NotificationRead.findOneAndUpdate(
    { userId: sessionUuid },
    { $set: { lastReadAt: new Date() } },
    { upsert: true, new: true }
  );

  return { success: true };
}

export async function getUnreadCountAction() {
  await dbConnect();
  const rawSession = (await cookies()).get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) return { success: true, count: 0 };

  const readState = await NotificationRead.findOne({ userId: sessionUuid })
    .select("lastReadAt")
    .lean();
  const lastReadAt = readState?.lastReadAt || new Date(0); // If never read, consider all as unread

  // Count active broadcasts created AFTER the user last opened the bell
  const count = await Broadcast.countDocuments({
    expiresAt: { $gt: new Date() },
    createdAt: { $gt: lastReadAt },
  });

  return { success: true, count };
}

export async function deleteBroadcastAction(id: string) {
  await verifyOwner();

  if (typeof id !== "string" || !mongoose.isValidObjectId(id)) {
    throw new Error("Invalid broadcast ID.");
  }

  const broadcast = await Broadcast.findById(id).select("_id fileUrl").lean();
  if (!broadcast) {
    return { success: true };
  }

  if (broadcast.fileUrl) {
    const parsedAttachment = parseSafeUploadThingUrl(broadcast.fileUrl);
    if (parsedAttachment) {
      try {
        const utapi = new UTApi();
        const delRes = await utapi.deleteFiles([parsedAttachment.fileKey]);
        if (!delRes?.success) {
          console.warn("UploadThing deletion returned unsuccessful for broadcast:", id);
        }
      } catch (err) {
        console.warn("Failed to delete UploadThing attachment for broadcast:", id, err);
      }
    }
  }

  await Broadcast.findByIdAndDelete(id);
  return { success: true };
}
