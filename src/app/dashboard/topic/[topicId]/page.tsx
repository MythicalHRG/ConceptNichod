export const dynamic = 'force-dynamic';
import { TopicPageClient } from "@/components/topic/topic-page-client";
import dbConnect from "@/lib/mongoose";
import Topic from "@/models/Topic";
import mongoose from "mongoose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function TopicPage({ params }: { params: { topicId: string } }) {
  await dbConnect();
  
  if (!mongoose.isValidObjectId(params.topicId)) {
    return <div>Invalid Topic ID</div>;
  }

  const sessionCookie = cookies().get("user_session");
  if (!sessionCookie) {
    redirect("/?login=true");
  }

  const topicDoc = await Topic.findById(params.topicId).lean();

  if (!topicDoc) {
    return <div>Topic not found</div>;
  }

  if (topicDoc.userId !== sessionCookie.value) {
    return <div>Unauthorized access to this topic</div>;
  }

  const topic = {
    ...JSON.parse(JSON.stringify(topicDoc)),
    id: topicDoc._id.toString(),
  };

  return (
    <div>
      <TopicPageClient initialTopic={topic as any} topicId={params.topicId} />
    </div>
  );
}
