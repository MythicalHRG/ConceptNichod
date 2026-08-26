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
import { createClient } from '@deepgram/sdk';

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
    summary,
    topic: topicName,
    classLevel,
    writtenAnswers,
    spokenAnswers,
  });

  const analysis = result.analysis;
  if (!analysis) {
    throw new Error("Analysis could not be generated.");
  }
  
  await Topic.findByIdAndUpdate(topicId, { analysis, practiceStatus: 'completed' });
  
  revalidatePath(`/dashboard/topic/${topicId}`, 'page');

  return { analysis };
}

export async function textToSpeechAction(text: string) {
    const result = await textToSpeech(text);
    return result;
}

export async function revalidateDashboard() {
  revalidatePath('/dashboard', 'layout');
}

export async function getDeepgramSessionKey() {
  const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
  const projectId = process.env.DEEPGRAM_PROJECT_ID;

  if (!deepgramApiKey || !projectId) {
    throw new Error("DEEPGRAM_API_KEY or DEEPGRAM_PROJECT_ID is not set in the environment.");
  }

  const deepgram = createClient(deepgramApiKey);

  const { result, error } = await deepgram.manage.createProjectKey(
    projectId,
    {
      comment: 'Temporary key for speech-to-text',
      scopes: ['usage:write'],
      time_to_live_in_seconds: 60 * 10
    }
  );

  if (error) {
    console.error("Deepgram key creation error:", error);
    throw new Error("Could not create Deepgram session key.");
  }
  
  if (!result || !result.key) {
      throw new Error("Deepgram returned no key.");
  }

  return { key: result.key };
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
