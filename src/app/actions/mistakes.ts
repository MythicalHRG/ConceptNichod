"use server";

import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import MistakeEntry from "@/models/MistakeEntry";
import { verifySessionCookie } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limiter";
import { recordUserStudyActivity } from "@/lib/streak";
import { callOpenRouter, parseJsonResponse } from "@/lib/openrouter";

function sanitize(str: string): string {
  return (str || "")
    .trim()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function getAuthenticatedUser() {
  await dbConnect();
  const rawSession = cookies().get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) {
    throw new Error("Authentication required.");
  }
  const user = await User.findOne({ uuid: sessionUuid }).lean();
  if (!user) {
    throw new Error("User account not found.");
  }
  return user;
}

export interface MistakeItem {
  id: string;
  title: string;
  subject: string;
  chapter: string;
  errorType: "conceptual" | "calculation" | "formula" | "misread";
  questionOrPrompt: string;
  myMistake: string;
  correctConcept: string;
  status: "unresolved" | "mastered";
  reviewCount: number;
  lastReviewedAt?: string;
  createdAt: string;
}

export async function getMistakesDataAction(filter?: {
  subject?: string;
  status?: string;
  search?: string;
}) {
  const user = await getAuthenticatedUser();
  await dbConnect();

  const query: any = { userId: user.uuid };

  if (filter?.status && filter.status !== "all") {
    query.status = filter.status;
  }
  if (filter?.subject && filter.subject !== "all") {
    query.subject = filter.subject;
  }
  if (filter?.search && filter.search.trim()) {
    const s = filter.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.$or = [
      { title: { $regex: s, $options: "i" } },
      { questionOrPrompt: { $regex: s, $options: "i" } },
      { myMistake: { $regex: s, $options: "i" } },
      { correctConcept: { $regex: s, $options: "i" } },
      { chapter: { $regex: s, $options: "i" } },
    ];
  }

  const [docs, allUserDocs] = await Promise.all([
    MistakeEntry.find(query).sort({ createdAt: -1 }).limit(100).lean(),
    MistakeEntry.find({ userId: user.uuid }).select("subject status").lean(),
  ]);

  const totalCount = allUserDocs.length;
  const unresolvedCount = allUserDocs.filter((d) => d.status === "unresolved").length;
  const masteredCount = allUserDocs.filter((d) => d.status === "mastered").length;

  const subjectCounts: Record<string, number> = {};
  allUserDocs.forEach((d) => {
    const s = d.subject || "General";
    subjectCounts[s] = (subjectCounts[s] || 0) + 1;
  });

  const mistakes: MistakeItem[] = docs.map((doc: any) => ({
    id: doc._id.toString(),
    title: doc.title,
    subject: doc.subject,
    chapter: doc.chapter || "",
    errorType: doc.errorType || "conceptual",
    questionOrPrompt: doc.questionOrPrompt || "",
    myMistake: doc.myMistake,
    correctConcept: doc.correctConcept,
    status: doc.status,
    reviewCount: doc.reviewCount || 0,
    lastReviewedAt: doc.lastReviewedAt ? new Date(doc.lastReviewedAt).toISOString() : undefined,
    createdAt: new Date(doc.createdAt).toISOString(),
  }));

  return {
    mistakes,
    counts: {
      total: totalCount,
      unresolved: unresolvedCount,
      mastered: masteredCount,
      subjects: subjectCounts,
    },
  };
}

export async function createMistakeAction(input: {
  title: string;
  subject: string;
  chapter?: string;
  errorType: "conceptual" | "calculation" | "formula" | "misread";
  questionOrPrompt?: string;
  myMistake: string;
  correctConcept: string;
}) {
  const user = await getAuthenticatedUser();

  const rateCheck = checkRateLimit(`mistake-create:${user.uuid}`, 20, 3600000);
  if (!rateCheck.success) {
    throw new Error("You have reached the hourly limit for logging mistakes.");
  }

  const title = (input.title || "").trim().slice(0, 120);
  const subject = (input.subject || "").trim().slice(0, 60);
  const chapter = (input.chapter || "").trim().slice(0, 80);
  const questionOrPrompt = (input.questionOrPrompt || "").trim().slice(0, 3000);
  const myMistake = (input.myMistake || "").trim().slice(0, 2500);
  const correctConcept = (input.correctConcept || "").trim().slice(0, 2500);

  if (!title || !subject || !myMistake || !correctConcept) {
    throw new Error("Title, subject, your mistake, and the correct concept are required.");
  }

  const entry = new MistakeEntry({
    userId: user.uuid,
    title: sanitize(title),
    subject: sanitize(subject),
    chapter: sanitize(chapter),
    errorType: input.errorType || "conceptual",
    questionOrPrompt: sanitize(questionOrPrompt),
    myMistake: sanitize(myMistake),
    correctConcept: sanitize(correctConcept),
    status: "unresolved",
    createdAt: new Date(),
  });

  await entry.save();
  await recordUserStudyActivity(user.uuid);

  return {
    success: true,
    mistakeId: entry._id.toString(),
  };
}

export async function updateMistakeStatusAction(
  mistakeId: string,
  status: "unresolved" | "mastered"
) {
  const user = await getAuthenticatedUser();
  await dbConnect();

  const entry = await MistakeEntry.findOne({ _id: mistakeId, userId: user.uuid });
  if (!entry) throw new Error("Mistake entry not found.");

  entry.status = status;
  if (status === "mastered") {
    entry.reviewCount = (entry.reviewCount || 0) + 1;
    entry.lastReviewedAt = new Date();
  }
  await entry.save();
  await recordUserStudyActivity(user.uuid);

  return { success: true, status: entry.status };
}

export async function deleteMistakeAction(mistakeId: string) {
  const user = await getAuthenticatedUser();
  await dbConnect();

  const res = await MistakeEntry.deleteOne({ _id: mistakeId, userId: user.uuid });
  if (res.deletedCount === 0) throw new Error("Mistake entry not found or already deleted.");

  return { success: true };
}

export interface MistakeQuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  relatedMistake: string;
}

export async function generateMistakeQuizAction(subject?: string) {
  const user = await getAuthenticatedUser();
  await dbConnect();

  const query: any = { userId: user.uuid, status: "unresolved" };
  if (subject && subject !== "all") {
    query.subject = subject;
  }

  const unresolvedDocs = await MistakeEntry.find(query)
    .sort({ createdAt: -1 })
    .limit(4)
    .lean();

  if (unresolvedDocs.length === 0) {
    throw new Error(
      "You have no unresolved mistakes logged yet! Log your mistakes first or mark some for revision to take a drill."
    );
  }

  const mistakeSummaries = unresolvedDocs.map(
    (d, i) =>
      `[Item ${i + 1}] Subject: ${d.subject}, Concept: ${d.title}\nStudent's Past Mistake: ${d.myMistake}\nCorrect Concept: ${d.correctConcept}`
  ).join("\n\n");

  const prompt = `You are an expert exam tutor for Indian competitive examinations (IIT JEE, NEET, CBSE).
A student has logged the following mistakes in their Mistake Notebook:

${mistakeSummaries}

Generate a short 3-question diagnostic multiple choice quiz designed to test whether the student has truly fixed these specific mistakes.
Each question must test the correct concept directly and address common traps that led to their past mistake.

Respond with ONLY a valid JSON object in this format (no markdown fences, no preambles):
{
  "questions": [
    {
      "id": "q1",
      "question": "Clear problem statement with LaTeX math if needed e.g. $E = -\\frac{d\\Phi}{dt}$",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "Concise pedagogical explanation of why this option is correct and how to avoid the mistake.",
      "relatedMistake": "${unresolvedDocs[0].title}"
    }
  ]
}`;

  try {
    const raw = await callOpenRouter([{ role: "user", content: prompt }], undefined, true);
    const parsed = parseJsonResponse<{ questions: MistakeQuizQuestion[] }>(raw);

    if (!parsed.questions || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      throw new Error("Could not parse quiz questions.");
    }

    return {
      success: true,
      questions: parsed.questions,
    };
  } catch (err: any) {
    console.error("Mistake quiz generation error:", err);
    throw new Error(err.message || "Failed to generate mistake quiz.");
  }
}
