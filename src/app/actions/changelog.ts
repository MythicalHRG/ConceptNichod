"use server";


import { isPlatformOwner } from "@/lib/owner-access";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import Changelog from "@/models/Changelog";
import { verifySessionCookie } from "@/lib/session";

const ADMIN_USERNAME = "mythicalhrg";

async function verifyOwner() {
  await dbConnect();
  const rawSession = (await cookies()).get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) throw new Error("Not authenticated");

  const user = await User.findOne({ uuid: sessionUuid }).lean();
  if (!isPlatformOwner(user)) {
    throw new Error("Forbidden: Admin access only");
  }
  return user;
}

export async function checkIsAdminAction(): Promise<boolean> {
  try {
    await dbConnect();
    const rawSession = (await cookies()).get("user_session")?.value;
    const sessionUuid = verifySessionCookie(rawSession);
    if (!sessionUuid) return false;
    const user = await User.findOne({ uuid: sessionUuid }).lean();
    return isPlatformOwner(user);
  } catch {
    return false;
  }
}

export async function getChangelogsAction() {
  try {
    await dbConnect();
    const logs = await Changelog.find().sort({ releaseDate: -1, createdAt: -1 }).lean();
    return {
      success: true,
      changelogs: JSON.parse(JSON.stringify(logs)),
    };
  } catch (err: any) {
    console.error("getChangelogsAction error:", err.message);
    return {
      success: false,
      changelogs: [],
    };
  }
}

export async function createChangelogAction(formData: FormData) {
  const admin = await verifyOwner();

  const version = formData.get("version") as string;
  const title = formData.get("title") as string;
  const category = (formData.get("category") as string) || "Feature";
  const content = formData.get("content") as string;
  const releaseDateStr = formData.get("releaseDate") as string;

  if (!version || !title || !content) {
    throw new Error("Missing required fields: version, title, or content");
  }

  const releaseDate = releaseDateStr ? new Date(releaseDateStr) : new Date();

  // If a changelog with this version already exists, update it in-place seamlessly
  const existingLog = await Changelog.findOne({ version: version.trim() });
  if (existingLog) {
    existingLog.title = title.trim();
    existingLog.category = category as any;
    existingLog.content = content.trim();
    existingLog.releaseDate = releaseDate;
    await existingLog.save();
    return {
      success: true,
      changelog: JSON.parse(JSON.stringify(existingLog)),
      updated: true,
    };
  }

  const newLog = await Changelog.create({
    version: version.trim(),
    title: title.trim(),
    category: category as any,
    content: content.trim(),
    createdBy: admin.username,
    releaseDate,
  });

  return {
    success: true,
    changelog: JSON.parse(JSON.stringify(newLog)),
  };
}

export async function updateChangelogAction(id: string, formData: FormData) {
  await verifyOwner();

  const version = formData.get("version") as string;
  const title = formData.get("title") as string;
  const category = (formData.get("category") as string) || "Feature";
  const content = formData.get("content") as string;
  const releaseDateStr = formData.get("releaseDate") as string;

  if (!version || !title || !content) {
    throw new Error("Missing required fields: version, title, or content");
  }

  const updateData: any = {
    version: version.trim(),
    title: title.trim(),
    category,
    content: content.trim(),
  };

  if (releaseDateStr) {
    updateData.releaseDate = new Date(releaseDateStr);
  }

  const updatedLog = await Changelog.findByIdAndUpdate(id, updateData, { new: true }).lean();

  return {
    success: true,
    changelog: JSON.parse(JSON.stringify(updatedLog)),
  };
}

export async function deleteChangelogAction(id: string) {
  await verifyOwner();
  await Changelog.findByIdAndDelete(id);
  return { success: true };
}
