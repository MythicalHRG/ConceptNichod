export const dynamic = 'force-dynamic';
import { TopicPageClient } from "@/components/topic/topic-page-client";
import dbConnect from "@/lib/mongoose";
import Topic from "@/models/Topic";
import mongoose from "mongoose";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getVerifiedSessionUuid } from "@/lib/session-auth";
import { assertActiveNonBlacklistedUser } from "@/lib/ai-flow-auth";

export default async function TopicPage({
  params,
}: {
  params: Promise<{ topicId: string }> | { topicId: string };
}) {
  const { topicId } = await params;

  const rawSession = (await cookies()).get("user_session")?.value;
  const sessionUuid = await getVerifiedSessionUuid(rawSession);
  if (!sessionUuid) {
    redirect("/?login=true");
  }

  if (typeof topicId !== "string" || !mongoose.isValidObjectId(topicId)) {
    notFound();
  }

  let topicDoc = null;
  let isDbWakingUp = false;
  let accessDenied = false;

  try {
    await dbConnect();
    try {
      await assertActiveNonBlacklistedUser(sessionUuid);
    } catch {
      accessDenied = true;
    }
    if (!accessDenied) {
      // Atomic ownership-scoped query prevents IDOR existence enumeration
      topicDoc = await Topic.findOne({ _id: topicId, userId: sessionUuid }).lean();
    }
  } catch (error) {
    console.error("Topic page dbConnect error:", error);
    isDbWakingUp = true;
  }

  if (accessDenied) {
    redirect("/?login=true");
  }

  if (isDbWakingUp) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <meta httpEquiv="refresh" content="3" />
        <h1 className="text-2xl font-bold animate-pulse">Waking up database...</h1>
      </div>
    );
  }

  if (!topicDoc) {
    notFound();
  }

  const topic = {
    ...JSON.parse(JSON.stringify(topicDoc)),
    id: topicDoc._id.toString(),
  };

  return (
    <div>
      <TopicPageClient initialTopic={topic as any} topicId={topicId} />
    </div>
  );
}
