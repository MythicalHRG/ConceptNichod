"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { ensurePlatformOwnerRole, isPlatformOwner } from "@/lib/owner-access";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import Changelog, { type IChangelog } from "@/models/Changelog";
import { verifySessionCookie } from "@/lib/session";

const ALLOWED_CATEGORIES = new Set<IChangelog["category"]>([
  "Major Update",
  "Feature",
  "Improvement",
  "Bug Fix",
  "Security",
]);

function readFormString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseReleaseDate(raw: string): Date {
  if (!raw) return new Date();
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("Invalid release date.");
  }
  return parsed;
}

async function verifyOwner() {
  await dbConnect();
  const rawSession = (await cookies()).get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) throw new Error("Not authenticated");

  const fetchedUser = await User.findOne({ uuid: sessionUuid })
    .select("uuid username email role")
    .lean();
  const user = fetchedUser ? await ensurePlatformOwnerRole(fetchedUser) : fetchedUser;
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
    const fetchedUser = await User.findOne({ uuid: sessionUuid })
      .select("uuid username email role")
      .lean();
    const user = fetchedUser ? await ensurePlatformOwnerRole(fetchedUser) : fetchedUser;
    return isPlatformOwner(user);
  } catch {
    return false;
  }
}

export async function getChangelogsAction() {
  try {
    await dbConnect();
    const logs = await Changelog.find()
      .sort({ releaseDate: -1, createdAt: -1 })
      .limit(100)
      .lean();
    return {
      success: true,
      changelogs: JSON.parse(JSON.stringify(logs)),
    };
  } catch (err: any) {
    console.error("getChangelogsAction error:", err?.message || err);
    return {
      success: false,
      changelogs: [],
    };
  }
}

export async function createChangelogAction(formData: FormData) {
  const admin = await verifyOwner();

  if (!(formData instanceof FormData)) {
    throw new Error("Invalid changelog submission.");
  }

  const version = readFormString(formData, "version");
  const title = readFormString(formData, "title");
  const rawCategory = readFormString(formData, "category") || "Feature";
  const content = readFormString(formData, "content");
  const releaseDateStr = readFormString(formData, "releaseDate");

  if (!version || !title || !content) {
    throw new Error("Missing required fields: version, title, or content");
  }
  if (version.length > 50 || title.length > 200 || content.length > 20000) {
    throw new Error("Changelog fields exceed maximum allowed length.");
  }
  if (!ALLOWED_CATEGORIES.has(rawCategory as IChangelog["category"])) {
    throw new Error("Invalid changelog category.");
  }
  const category = rawCategory as IChangelog["category"];
  const releaseDate = parseReleaseDate(releaseDateStr);

  // If a changelog with this version already exists, update it in-place seamlessly
  const existingLog = await Changelog.findOne({ version });
  if (existingLog) {
    existingLog.title = title;
    existingLog.category = category;
    existingLog.content = content;
    existingLog.releaseDate = releaseDate;
    await existingLog.save();
    revalidatePath("/changelog");
    return {
      success: true,
      changelog: JSON.parse(JSON.stringify(existingLog)),
      updated: true,
    };
  }

  const newLog = await Changelog.create({
    version,
    title,
    category,
    content,
    createdBy: admin.username,
    releaseDate,
  });

  revalidatePath("/changelog");
  return {
    success: true,
    changelog: JSON.parse(JSON.stringify(newLog)),
  };
}

export async function updateChangelogAction(id: string, formData: FormData) {
  await verifyOwner();

  if (typeof id !== "string" || !mongoose.isValidObjectId(id)) {
    throw new Error("Invalid changelog ID.");
  }
  if (!(formData instanceof FormData)) {
    throw new Error("Invalid changelog submission.");
  }

  const version = readFormString(formData, "version");
  const title = readFormString(formData, "title");
  const rawCategory = readFormString(formData, "category") || "Feature";
  const content = readFormString(formData, "content");
  const releaseDateStr = readFormString(formData, "releaseDate");

  if (!version || !title || !content) {
    throw new Error("Missing required fields: version, title, or content");
  }
  if (version.length > 50 || title.length > 200 || content.length > 20000) {
    throw new Error("Changelog fields exceed maximum allowed length.");
  }
  if (!ALLOWED_CATEGORIES.has(rawCategory as IChangelog["category"])) {
    throw new Error("Invalid changelog category.");
  }

  const updateData: Record<string, unknown> = {
    version,
    title,
    category: rawCategory as IChangelog["category"],
    content,
  };

  if (releaseDateStr) {
    updateData.releaseDate = parseReleaseDate(releaseDateStr);
  }

  const updatedLog = await Changelog.findByIdAndUpdate(
    id,
    { $set: updateData },
    { new: true, runValidators: true }
  ).lean();

  if (!updatedLog) {
    throw new Error("Changelog entry not found.");
  }

  revalidatePath("/changelog");
  return {
    success: true,
    changelog: JSON.parse(JSON.stringify(updatedLog)),
  };
}

export async function deleteChangelogAction(id: string) {
  await verifyOwner();
  if (typeof id !== "string" || !mongoose.isValidObjectId(id)) {
    throw new Error("Invalid changelog ID.");
  }
  await Changelog.findByIdAndDelete(id);
  revalidatePath("/changelog");
  return { success: true };
}
