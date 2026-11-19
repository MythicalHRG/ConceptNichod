import mongoose from "mongoose";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import Topic from "@/models/Topic";
import { verifySessionCookie } from "@/lib/session";
import { checkDistributedRateLimit } from "@/lib/distributed-rate-limiter";

/** Server-only guard for directly invokable AI topic-generation actions. */
export async function requireOwnedTopicGenerationAccess(topicId: unknown): Promise<string> {
  const rawSession = (await cookies()).get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) throw new Error("Not authenticated");

  if (typeof topicId !== "string" || !mongoose.isValidObjectId(topicId)) {
    throw new Error("Invalid Topic ID");
  }

  const rateCheck = await checkDistributedRateLimit(`topic-ai-flow:${sessionUuid}`, 10, 15 * 60 * 1000);
  if (!rateCheck.success) throw new Error("Too many AI topic-generation requests. Please try again later.");

  await dbConnect();
  const ownedTopic = await Topic.findOne({ _id: topicId, userId: sessionUuid }).select("_id").lean();
  if (!ownedTopic) throw new Error("Topic not found or access denied.");

  return sessionUuid;
}
