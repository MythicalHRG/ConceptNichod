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
import { getVerifiedSessionUuid } from "@/lib/session-auth";
import { checkDistributedRateLimit } from "@/lib/distributed-rate-limiter";
import { assertActiveNonBlacklistedUser } from "@/lib/ai-flow-auth";

export async function generateContentAction(topicId: string, topicName: string, classLevel: string) {
  await dbConnect();

  const rawSession = (await cookies()).get("user_session")?.value;
  const sessionUuid = await getVerifiedSessionUuid(rawSession);
  if (!sessionUuid) throw new Error("Not authenticated");
  const rateLimit = await checkDistributedRateLimit(`generate-content:${sessionUuid}`, 3, 10 * 60 * 1000);
  if (!rateLimit.success) throw new Error("Too many topic-generation requests. Please wait before trying again.");
  if (typeof topicId !== "string" || !mongoose.isValidObjectId(topicId)) throw new Error("Invalid Topic ID");

  await assertActiveNonBlacklistedUser(sessionUuid);

  const topicDoc = await Topic.findOne({ _id: topicId, userId: sessionUuid });
  if (!topicDoc) throw new Error("Topic not found or access denied.");

  const subject = topicDoc.subject || "Unknown";
  const chapter = topicDoc.chapter || "Unknown";
  const examFocus = topicDoc.examFocus || undefined;

  // Use database-owned topic metadata; never trust client-supplied prompt context.
  const authoritativeTopicName = topicDoc.name;
  const authoritativeClassLevel = topicDoc.classLevel;
  const { summary } = await generateTopicSummary({
    topicId,
    topic: authoritativeTopicName,
    classLevel: authoritativeClassLevel,
    subject,
    chapter,
    examFocus,
  });
  const { questions } = await generateQuestionsFlow({
    topicId,
    summary: summary.slice(0, 8000),
    topic: authoritativeTopicName,
    classLevel: authoritativeClassLevel,
    subject,
    chapter,
    examFocus,
  });

  await Topic.findOneAndUpdate(
    { _id: topicId, userId: sessionUuid },
    { $set: { summary, questions } }
  );

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
  const rawSession = (await cookies()).get("user_session")?.value;
  const sessionUuid = await getVerifiedSessionUuid(rawSession);
  if (!sessionUuid) throw new Error("Not authenticated");
  const rateLimit = await checkDistributedRateLimit(`final-analysis:${sessionUuid}`, 5, 15 * 60 * 1000);
  if (!rateLimit.success) throw new Error("Too many analysis requests. Please wait before trying again.");
  if (typeof topicId !== "string" || !mongoose.isValidObjectId(topicId)) throw new Error("Invalid Topic ID");
  if (!Array.isArray(writtenAnswers) || !Array.isArray(spokenAnswers)) {
    throw new Error("Invalid answer submission.");
  }
  if (writtenAnswers.length > 10 || spokenAnswers.length > 11) {
    throw new Error("Too many answers were submitted.");
  }
  const submittedAnswers = [...writtenAnswers, ...spokenAnswers];
  if (submittedAnswers.length === 0) {
    throw new Error("At least one written or spoken answer is required.");
  }
  if (submittedAnswers.some((answer) => !answer || typeof answer.answer !== "string" || answer.answer.length > 5000)) {
    throw new Error("Each answer must be text no longer than 5,000 characters.");
  }

  await dbConnect();
  await assertActiveNonBlacklistedUser(sessionUuid);

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

  // Load authoritative topic metadata from database to prevent prompt injection
  const authoritativeTopicName = topicDoc.name;
  const authoritativeSummary = topicDoc.summary;
  const authoritativeClassLevel = topicDoc.classLevel;
  if (!authoritativeSummary) throw new Error("Generate the topic summary before submitting answers.");

  // Use authoritative question text from the database and reject injected extras.
  const dbQuestions = Array.isArray(topicDoc.questions) ? topicDoc.questions : [];
  const splitIndex = Math.ceil(dbQuestions.length / 2);
  const textQuestions = dbQuestions.slice(0, splitIndex);
  const voiceQuestions = dbQuestions.slice(splitIndex);
  if (writtenAnswers.length > textQuestions.length || spokenAnswers.length > voiceQuestions.length + 1) {
    throw new Error("The submitted answers do not match this practice session.");
  }
  if (
    writtenAnswers.some((_, idx) => typeof textQuestions[idx]?.question !== "string" || !textQuestions[idx].question.trim()) ||
    spokenAnswers.some((_, idx) => idx < voiceQuestions.length && (typeof voiceQuestions[idx]?.question !== "string" || !voiceQuestions[idx].question.trim()))
  ) {
    throw new Error("Topic practice questions are incomplete. Please regenerate the topic content.");
  }

  const safeWrittenAnswers = writtenAnswers.map((ans, idx) => ({
    question: textQuestions[idx].question,
    answer: ans.answer.trim(),
  }));

  const safeSpokenAnswers = spokenAnswers.map((ans, idx) => ({
    question: idx < voiceQuestions.length
      ? voiceQuestions[idx].question
      : "Overall Topic Summary (2-Minute Challenge)",
    answer: ans.answer.trim(),
  }));

  // Atomic lock against concurrent duplicate submissions
  const lockedTopic = await Topic.findOneAndUpdate(
    { _id: topicId, userId: sessionUuid, practiceStatus: { $ne: 'completed' } },
    { $set: { practiceStatus: 'completed' } }
  );

  if (!lockedTopic) {
    const refreshed = await Topic.findOne({ _id: topicId, userId: sessionUuid });
    if (refreshed?.analysis) {
      return { analysis: refreshed.analysis };
    }
    throw new Error("Practice session evaluation is already in progress or completed.");
  }

  try {
    const result = await analyzeAnswersFlow({
      topicId,
      topic: authoritativeTopicName,
      summary: authoritativeSummary.slice(0, 8000),
      classLevel: authoritativeClassLevel,
      writtenAnswers: safeWrittenAnswers,
      spokenAnswers: safeSpokenAnswers,
    });

    await Topic.findOneAndUpdate(
      { _id: topicId, userId: sessionUuid },
      {
        $set: {
          analysis: result.analysis,
          practiceStatus: 'completed',
        },
      }
    );

    revalidatePath(`/dashboard/topic/${topicId}`);
    return result;
  } catch (error) {
    // If analysis failed due to upstream network issue, revert status so student can retry
    await Topic.findOneAndUpdate(
      { _id: topicId, userId: sessionUuid, analysis: { $exists: false } },
      { $set: { practiceStatus: 'in_progress' } }
    );
    throw error;
  }
}

export async function generateAudioAction(text: string): Promise<string> {
    const rawSession = (await cookies()).get("user_session")?.value;
    const sessionUuid = await getVerifiedSessionUuid(rawSession);
    if (!sessionUuid) throw new Error("Not authenticated");

    const cleanText = typeof text === "string" ? text.trim() : "";
    if (!cleanText || cleanText.length > 5000) {
      throw new Error("Audio text must contain between 1 and 5,000 characters.");
    }

    const rateLimit = await checkDistributedRateLimit(`text-to-speech:${sessionUuid}`, 10, 60 * 1000);
    if (!rateLimit.success) throw new Error("Too many audio requests. Please wait before trying again.");
    await assertActiveNonBlacklistedUser(sessionUuid);

    const res = await textToSpeech(cleanText);
    return res.media;
}

export async function revalidateDashboard() {
  const rawSession = (await cookies()).get("user_session")?.value;
  const sessionUuid = await getVerifiedSessionUuid(rawSession);
  if (!sessionUuid) throw new Error("Not authenticated");
  const rateLimit = await checkDistributedRateLimit(`revalidate-dashboard:${sessionUuid}`, 30, 60 * 1000);
  if (!rateLimit.success) throw new Error("Too many refresh requests. Please wait a moment.");
  revalidatePath('/dashboard', 'layout');
}

/**
 * Kept for backwards compatibility; audio recording is processed directly in the client browser
 */
export async function getDeepgramSessionKey(): Promise<{ key?: string; error?: string }> {
  return { error: "Voice input is processed directly in your browser." };
}

export async function createTopicAction(data: { name: string, subject: string, chapter: string }) {
  await dbConnect();
  const rawSession = (await cookies()).get("user_session")?.value;
  const sessionUuid = await getVerifiedSessionUuid(rawSession);
  if (!sessionUuid) throw new Error("Not authenticated");
  const rateLimit = await checkDistributedRateLimit(`create-topic:${sessionUuid}`, 20, 60 * 60 * 1000);
  if (!rateLimit.success) throw new Error("You have reached the topic-creation limit. Please try again later.");

  if (!data || typeof data !== "object" ||
      typeof data.name !== "string" || typeof data.subject !== "string" || typeof data.chapter !== "string") {
    throw new Error("Topic, subject, and chapter are required.");
  }

  const cleanName = data.name.trim().slice(0, 150);
  const cleanSubject = data.subject.trim().slice(0, 80);
  const cleanChapter = data.chapter.trim().slice(0, 150);
  if (!cleanName || !cleanSubject || !cleanChapter) throw new Error("Topic, subject, and chapter are required.");

  await assertActiveNonBlacklistedUser(sessionUuid);

  const User = (await import("@/models/User")).default;
  const user = await User.findOne({ uuid: sessionUuid }).select("classLevel examFocus").lean();
  if (!user) throw new Error("User not found");

  const newTopic = await Topic.create({
    name: cleanName,
    subject: cleanSubject,
    chapter: cleanChapter,
    classLevel: user.classLevel || "Unknown",
    examFocus: user.examFocus || "",
    userId: sessionUuid
  });

  return newTopic._id.toString();
}

export async function markSummaryViewedAction(topicId: string) {
  await dbConnect();
  const rawSession = (await cookies()).get("user_session")?.value;
  const sessionUuid = await getVerifiedSessionUuid(rawSession);
  if (!sessionUuid) throw new Error("Not authenticated");
  if (typeof topicId !== "string" || !mongoose.isValidObjectId(topicId)) throw new Error("Invalid Topic ID");

  const rateLimit = await checkDistributedRateLimit(`summary-viewed:${sessionUuid}`, 60, 60 * 1000);
  if (!rateLimit.success) throw new Error("Too many requests. Please wait a moment.");

  await assertActiveNonBlacklistedUser(sessionUuid);

  const updated = await Topic.findOneAndUpdate(
    { _id: topicId, userId: sessionUuid },
    { $set: { summaryViewed: true } },
    { new: true }
  ).select("_id").lean();
  if (!updated) throw new Error("Topic not found or access denied.");

  revalidatePath(`/dashboard/topic/${topicId}`, 'page');
}

export async function updateTopicProgressAction(
  topicId: string,
  status: 'in_progress' | 'completed',
  savedWrittenAnswers: string[],
  savedSpokenAnswers: string[]
) {
  await dbConnect();
  const rawSession = (await cookies()).get("user_session")?.value;
  const sessionUuid = await getVerifiedSessionUuid(rawSession);
  if (!sessionUuid) throw new Error("Not authenticated");
  if (typeof topicId !== "string" || !mongoose.isValidObjectId(topicId)) throw new Error("Invalid Topic ID");
  if (status !== "in_progress" && status !== "completed") throw new Error("Invalid practice status.");
  if (!Array.isArray(savedWrittenAnswers) || !Array.isArray(savedSpokenAnswers)) {
    throw new Error("Invalid saved answers.");
  }
  const allAnswers = [...savedWrittenAnswers, ...savedSpokenAnswers];
  if (savedWrittenAnswers.length > 10 || savedSpokenAnswers.length > 11 ||
      allAnswers.some((answer) => typeof answer !== "string" || answer.length > 5000)) {
    throw new Error("Saved answers exceed the allowed limits.");
  }

  const rateLimit = await checkDistributedRateLimit(`topic-progress:${sessionUuid}`, 30, 60 * 1000);
  if (!rateLimit.success) throw new Error("Too many progress updates. Please wait before trying again.");

  await assertActiveNonBlacklistedUser(sessionUuid);

  const existingTopic = await Topic.findOne({ _id: topicId, userId: sessionUuid })
    .select("practiceStatus")
    .lean();
  if (!existingTopic) throw new Error("Topic not found or access denied.");
  if (existingTopic.practiceStatus === "completed") {
    throw new Error("Completed practice sessions cannot be modified.");
  }

  const updatedTopic = await Topic.findOneAndUpdate(
    { _id: topicId, userId: sessionUuid, practiceStatus: { $ne: "completed" } },
    {
      $set: {
        practiceStatus: status,
        savedWrittenAnswers,
        savedSpokenAnswers,
      },
    },
    { new: true }
  );
  if (!updatedTopic) throw new Error("Topic not found or access denied.");
}
