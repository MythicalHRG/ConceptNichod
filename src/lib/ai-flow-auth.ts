import mongoose from "mongoose";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import Topic from "@/models/Topic";
import User from "@/models/User";
import Blacklist from "@/models/Blacklist";
import { getVerifiedSessionUuid } from "@/lib/session-auth";
import { checkDistributedRateLimit } from "@/lib/distributed-rate-limiter";
import { normalizeEmail } from "@/lib/email-utils";

/** Verifies the authenticated user still exists and is not blacklisted. */
export async function assertActiveNonBlacklistedUser(sessionUuid: string): Promise<void> {
  await dbConnect();
  const user = await User.findOne({ uuid: sessionUuid })
    .select("uuid email username")
    .lean();
  if (!user) {
    throw new Error("Not authenticated");
  }

  const banClauses: Array<{ type: "email" | "username"; value: string | { $in: string[] } }> = [];
  if (typeof user.email === "string" && user.email.trim()) {
    const rawEmail = user.email.trim().toLowerCase();
    const canonicalEmail = normalizeEmail(rawEmail);
    const emailValues = Array.from(new Set([rawEmail, canonicalEmail].filter(Boolean)));
    if (emailValues.length > 0) {
      banClauses.push({ type: "email", value: { $in: emailValues } });
    }
  }
  if (typeof user.username === "string" && user.username.trim()) {
    banClauses.push({ type: "username", value: user.username.trim().toLowerCase() });
  }

  if (banClauses.length > 0) {
    const banned = await Blacklist.findOne({ $or: banClauses }).select("_id").lean();
    if (banned) {
      throw new Error("Access denied: Your account has been suspended.");
    }
  }
}

/** Server-only guard for directly invokable AI topic-generation actions. */
export async function requireOwnedTopicGenerationAccess(topicId: unknown): Promise<string> {
  const rawSession = (await cookies()).get("user_session")?.value;
  const sessionUuid = await getVerifiedSessionUuid(rawSession);
  if (!sessionUuid) throw new Error("Not authenticated");

  if (typeof topicId !== "string" || !mongoose.isValidObjectId(topicId)) {
    throw new Error("Invalid Topic ID");
  }

  const rateCheck = await checkDistributedRateLimit(`topic-ai-flow:${sessionUuid}`, 10, 15 * 60 * 1000);
  if (!rateCheck.success) throw new Error("Too many AI topic-generation requests. Please try again later.");

  await assertActiveNonBlacklistedUser(sessionUuid);
  const ownedTopic = await Topic.findOne({ _id: topicId, userId: sessionUuid }).select("_id").lean();
  if (!ownedTopic) throw new Error("Topic not found or access denied.");

  return sessionUuid;
}
