"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongoose";
import Topic from "@/models/Topic";
import { generateTopicSummary } from "@/ai/flows/generate-topic-summary";
import { generateQuestionsFlow } from "@/ai/flows/generate-questions";
import { analyzeAnswersFlow, FinalAnalysisOutput } from "@/ai/flows/analyze-answers";
import { textToSpeech } from "@/ai/flows/text-to-speech";

export async function generateContentAction(topicId: string, topicName:string, classLevel: string) {
  await dbConnect();
  
  const sessionUuid = cookies().get("user_session")?.value;
  if (!sessionUuid) throw new Error("Not authenticated");
  if (!mongoose.isValidObjectId(topicId)) throw new Error("Invalid Topic ID");
  
  const topicDoc = await Topic.findById(topicId);
  if (!topicDoc) throw new Error("Topic not found");
  if (topicDoc.userId !== sessionUuid) throw new Error("Unauthorized");
  
  const subject = topicDoc.subject || "Unknown";
  const chapter = topicDoc.chapter || "Unknown";
  const examFocus = topicDoc.examFocus || undefined;

  const { summary } = await generateTopicSummary({ topicId, topic: topicName, classLevel, subject, chapter, examFocus });
  const { questions } = await generateQuestionsFlow({ topicId, summary, topic: topicName, classLevel, subject, chapter, examFocus });

  await Topic.findByIdAndUpdate(topicId, { summary, questions });

  revalidatePath(`/dashboard/topic/${topicId}`);
  return { summary, questions };
}

export async function runFinalAnalysisAction(
  topicName: string,
  classLevel: string,
  summary: string,
  writtenAnswers: { question: string; answer: string }[],
  spokenAnswers: { question: string; answer: string }[],
  topicId: string
): Promise<{ analysis: FinalAnalysisOutput }> {
  const sessionUuid = cookies().get("user_session")?.value;
  if (!sessionUuid) throw new Error("Not authenticated");
  if (!mongoose.isValidObjectId(topicId)) throw new Error("Invalid Topic ID");

  await dbConnect();
  const topicDoc = await Topic.findById(topicId);
  if (!topicDoc) throw new Error("Topic not found");
  if (topicDoc.userId !== sessionUuid) throw new Error("Unauthorized");

  const result = await analyzeAnswersFlow({
    topicId,
    topic: topicName,
    summary,
    classLevel,
    writtenAnswers,
    spokenAnswers,
  });

  await Topic.findByIdAndUpdate(topicId, {
    analysis: result.analysis,
    practiceStatus: 'completed'
  });

  revalidatePath(`/dashboard/topic/${topicId}`);
  return result;
}

export async function generateAudioAction(text: string): Promise<string> {
    const res = await textToSpeech(text);
    return res.media;
}

export async function revalidateDashboard() {
  revalidatePath('/dashboard', 'layout');
}

/**
 * Kept for backwards compatibility; audio recording now uses native browser Web Speech API
 */
export async function getDeepgramSessionKey(): Promise<{ key?: string; error?: string }> {
  return { error: "Speech recognition migrated to native browser Web Speech API." };
}

export async function createTopicAction(data: { name: string, subject: string, chapter: string }) {
  await dbConnect();
  const sessionUuid = cookies().get("user_session")?.value;
  if (!sessionUuid) throw new Error("Not authenticated");
  
  const User = (await import("@/models/User")).default;
  const user = await User.findOne({ uuid: sessionUuid });
  if (!user) throw new Error("User not found");

  const newTopic = await Topic.create({ 
    ...data, 
    classLevel: user.classLevel || "Unknown",
    examFocus: user.examFocus || "",
    userId: sessionUuid 
  });

  return newTopic._id.toString();
}

export async function markSummaryViewedAction(topicId: string) {
  await dbConnect();
  const sessionUuid = cookies().get("user_session")?.value;
  if (!sessionUuid) throw new Error("Not authenticated");
  
  await Topic.findOneAndUpdate(
    { _id: topicId, userId: sessionUuid },
    { summaryViewed: true }
  );
  revalidatePath(`/dashboard/topic/${topicId}`, 'page');
}

export async function updateTopicProgressAction(
  topicId: string, 
  status: 'in_progress' | 'completed',
  savedWrittenAnswers: string[], 
  savedSpokenAnswers: string[]
) {
  await dbConnect();
  const sessionUuid = cookies().get("user_session")?.value;
  if (!sessionUuid) throw new Error("Not authenticated");
  
  await Topic.findOneAndUpdate(
    { _id: topicId, userId: sessionUuid },
    { 
      practiceStatus: status,
      savedWrittenAnswers,
      savedSpokenAnswers
    }
  );
}
