"use server";

import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import Changelog from "@/models/Changelog";

const ADMIN_USERNAME = "mythicalhrg";

async function verifyAdmin() {
  await dbConnect();
  const sessionUuid = cookies().get("user_session")?.value;
  if (!sessionUuid) throw new Error("Not authenticated");

  const user = await User.findOne({ uuid: sessionUuid }).lean();
  if (!user || user.username !== ADMIN_USERNAME) {
    throw new Error("Forbidden: Admin access only");
  }
  return user;
}

export async function checkIsAdminAction(): Promise<boolean> {
  try {
    await dbConnect();
    const sessionUuid = cookies().get("user_session")?.value;
    if (!sessionUuid) return false;
    const user = await User.findOne({ uuid: sessionUuid }).lean();
    return user?.username === ADMIN_USERNAME;
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
  const admin = await verifyAdmin();

  const version = formData.get("version") as string;
  const title = formData.get("title") as string;
  const category = (formData.get("category") as string) || "Feature";
  const content = formData.get("content") as string;
  const releaseDateStr = formData.get("releaseDate") as string;

  if (!version || !title || !content) {
    throw new Error("Missing required fields: version, title, or content");
  }

  const releaseDate = releaseDateStr ? new Date(releaseDateStr) : new Date();

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
  await verifyAdmin();

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
  await verifyAdmin();
  await Changelog.findByIdAndDelete(id);
  return { success: true };
}
