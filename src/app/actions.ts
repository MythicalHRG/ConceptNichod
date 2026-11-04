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
import { verifySessionCookie } from "@/lib/session";

export async function generateContentAction(topicId: string, topicName:string, classLevel: string) {
  await dbConnect();
  
  const rawSession = cookies().get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
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
  const rawSession = cookies().get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) throw new Error("Not authenticated");
  if (!mongoose.isValidObjectId(topicId)) throw new Error("Invalid Topic ID");

  await dbConnect();
  const topicDoc = await Topic.findById(topicId);
  if (!topicDoc) throw new Error("Topic not found");
  if (topicDoc.userId !== sessionUuid) throw new Error("Unauthorized");

  // Guard against re-submission if practice session has already been completed
  if (topicDoc.practiceStatus === 'completed') {
    if (topicDoc.analysis) {
      return { analysis: topicDoc.analysis };
    }
    throw new Error("Practice session has already been completed.");
  }

  // Atomic lock against concurrent duplicate submissions
  const lockedTopic = await Topic.findOneAndUpdate(
    { _id: topicId, userId: sessionUuid, practiceStatus: { $ne: 'completed' } },
    { practiceStatus: 'completed' }
  );

  if (!lockedTopic) {
    const refreshed = await Topic.findById(topicId);
    if (refreshed?.analysis) {
      return { analysis: refreshed.analysis };
    }
    throw new Error("Practice session evaluation is already in progress or completed.");
  }

  // Load authoritative topic metadata from database to prevent prompt injection
  const authoritativeTopicName = topicDoc.name || topicName;
  const authoritativeSummary = topicDoc.summary || summary;
  const authoritativeClassLevel = topicDoc.classLevel || classLevel;

  // Use authoritative question text from database to prevent question tampering attacks
  const dbQuestions = topicDoc.questions || [];
  const splitIndex = Math.ceil(dbQuestions.length / 2);
  const textQuestions = dbQuestions.slice(0, splitIndex);
  const voiceQuestions = dbQuestions.slice(splitIndex);

  const safeWrittenAnswers = (writtenAnswers || []).map((ans, idx) => ({
    question: textQuestions[idx]?.question || ans.question || `Question ${idx + 1}`,
    answer: ans.answer,
  }));

  const safeSpokenAnswers = (spokenAnswers || []).map((ans, idx) => {
    if (idx < voiceQuestions.length) {
      return {
        question: voiceQuestions[idx]?.question || ans.question || `Voice Question ${idx + 1}`,
        answer: ans.answer,
      };
    }
    return {
      question: "Overall Topic Summary (2-Minute Challenge)",
      answer: ans.answer,
    };
  });

  try {
    const result = await analyzeAnswersFlow({
      topicId,
      topic: authoritativeTopicName,
      summary: authoritativeSummary,
      classLevel: authoritativeClassLevel,
      writtenAnswers: safeWrittenAnswers,
      spokenAnswers: safeSpokenAnswers,
    });

    await Topic.findByIdAndUpdate(topicId, {
      analysis: result.analysis,
      practiceStatus: 'completed'
    });

    revalidatePath(`/dashboard/topic/${topicId}`);
    return result;
  } catch (error) {
    // If analysis failed due to upstream network issue, revert status so student can retry
    await Topic.findByIdAndUpdate(topicId, { practiceStatus: 'in_progress' });
    throw error;
  }
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
  const rawSession = cookies().get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
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
  const rawSession = cookies().get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
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
  const rawSession = cookies().get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
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
