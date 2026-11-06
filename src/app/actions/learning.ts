"use server";

import mongoose from "mongoose";
import dbConnect from "@/lib/mongoose";
import { requireSessionUuid } from "@/lib/server-auth";
import Topic from "@/models/Topic";
import StudyMaterial, { type StudyMaterialKind } from "@/models/StudyMaterial";
import StudyAttempt, { type StudyAttemptKind } from "@/models/StudyAttempt";
import ConceptRelation from "@/models/ConceptRelation";
import ConceptMirror from "@/models/ConceptMirror";
import StudyTest from "@/models/StudyTest";
import { callOpenRouter, parseJsonResponse } from "@/lib/openrouter";
import { analyzeConceptExplanation } from "@/ai/flows/analyze-concept-explanation";
import { enforcePersistentRateLimit } from "@/lib/persistent-rate-limit";
import User from "@/models/User";
import { getReviewIntervalDays } from "@/lib/spaced-repetition";

const cleanText = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const validConfidence = (value: number) => Number.isInteger(value) && value >= 1 && value <= 5;

export async function getStudyHubAction() {
  const userId = requireSessionUuid();
  await dbConnect();
  const now = new Date();
  const [cards, dueCards, attempts, topics, mirrorDocs, relations, user] = await Promise.all([
    StudyMaterial.find({ userId }).sort({ dueAt: 1, createdAt: -1 }).limit(250).lean(),
    StudyMaterial.find({ userId, dueAt: { $lte: now } }).sort({ dueAt: 1 }).limit(30).lean(),
    StudyAttempt.find({ userId }).sort({ createdAt: -1 }).limit(100).lean(),
    Topic.find({ userId }).select("name subject chapter summary questions analysis examFocus").sort({ createdAt: -1 }).lean(),
    ConceptMirror.find({ userId }).select("conceptName overallScore feedbackSummary createdAt").sort({ createdAt: -1 }).limit(50).lean(),
    ConceptRelation.find({ userId }).lean(),
    User.findOne({ uuid: userId }).select("examFocus").lean(),
  ]);
  const weak = attempts.filter((a) => a.score < 60).slice(0, 3).map((a) => `${a.title}: revisit ${a.weakAreas[0] || "the key ideas"}`);
  const recommendations = [
    ...(dueCards.length ? [`Review ${dueCards.length} item${dueCards.length === 1 ? "" : "s"} due today.`] : []),
    ...weak,
    ...(!dueCards.length && !weak.length && topics.length ? [`Create a mock test from ${topics[0].subject} / ${topics[0].chapter}.`] : []),
    ...(!topics.length ? [user?.examFocus ? `Start with a concept for your ${user.examFocus} goal.` : "Create your first topic to build a personal study plan."] : []),
  ];
  const timeline = [
    ...attempts.map((a) => ({ id: a._id.toString(), title: a.title, kind: a.kind, score: a.score, confidence: a.confidence, createdAt: a.createdAt })),
    ...topics.filter((t) => typeof t.analysis?.overallScore === "number").map((t) => ({ id: `topic-${t._id}`, title: t.name, kind: "topic-practice" as StudyAttemptKind, score: t.analysis.overallScore, createdAt: t.createdAt })),
    ...mirrorDocs.map((m) => ({ id: `mirror-${m._id}`, title: m.conceptName, kind: "concept-mirror" as StudyAttemptKind, score: m.overallScore, createdAt: m.createdAt })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 60);

  return JSON.parse(JSON.stringify({ cards, dueCards, attempts, topics, relations, recommendations, timeline }));
}

export async function saveStudyMaterialAction(input: {
  kind: StudyMaterialKind;
  title: string;
  prompt: string;
  answer: string;
  reason?: string;
  topicId?: string;
}) {
  const userId = requireSessionUuid();
  await dbConnect();
  const title = cleanText(input.title, 180);
  const prompt = cleanText(input.prompt, 3000);
  const answer = cleanText(input.answer, 6000);
  if (!["formula", "definition", "mistake"].includes(input.kind) || !title || !prompt || !answer) throw new Error("Title, prompt, and answer are required.");
  await enforcePersistentRateLimit(`study-material:${userId}`, 50, 24 * 60 * 60 * 1000);
  let topic: any = null;
  if (input.topicId) {
    if (!mongoose.isValidObjectId(input.topicId)) throw new Error("Invalid topic.");
    topic = await Topic.findOne({ _id: input.topicId, userId }).select("subject chapter").lean();
    if (!topic) throw new Error("Topic not found.");
  }
  const item = await StudyMaterial.create({
    userId, kind: input.kind, title, prompt, answer, reason: cleanText(input.reason, 1000),
    topicId: input.topicId, subject: topic?.subject, chapter: topic?.chapter,
  });
  return { id: item._id.toString() };
}

export async function deleteStudyMaterialAction(id: string) {
  const userId = requireSessionUuid();
  await dbConnect();
  if (!mongoose.isValidObjectId(id)) throw new Error("Invalid study item.");
  const result = await StudyMaterial.deleteOne({ _id: id, userId });
  if (!result.deletedCount) throw new Error("Study item not found.");
  return { success: true };
}

export async function rateStudyMaterialAction(id: string, rating: "again" | "hard" | "good" | "easy") {
  const userId = requireSessionUuid();
  await dbConnect();
  if (!mongoose.isValidObjectId(id) || !["again", "hard", "good", "easy"].includes(rating)) throw new Error("Invalid review.");
  const item = await StudyMaterial.findOne({ _id: id, userId });
  if (!item) throw new Error("Study item not found.");
  const nextInterval = getReviewIntervalDays(rating, item.intervalDays, item.repetitions);
  item.intervalDays = nextInterval;
  item.repetitions = rating === "again" ? 0 : item.repetitions + 1;
  item.lastReviewedAt = new Date();
  item.dueAt = new Date(Date.now() + nextInterval * 24 * 60 * 60 * 1000);
  await item.save();
  const score = rating === "again" ? 20 : rating === "hard" ? 50 : rating === "good" ? 80 : 100;
  await StudyAttempt.create({ userId, kind: "review", title: item.title, topicId: item.topicId, subject: item.subject, chapter: item.chapter, score, weakAreas: rating === "again" || rating === "hard" ? [item.title] : [] });
  return { dueAt: item.dueAt, intervalDays: nextInterval };
}

export async function extractStudyMaterialsAction(topicId: string) {
  const userId = requireSessionUuid();
  await dbConnect();
  await enforcePersistentRateLimit(`study-extract:${userId}`, 20, 60 * 60 * 1000);
  if (!mongoose.isValidObjectId(topicId)) throw new Error("Invalid topic.");
  const topic = await Topic.findOne({ _id: topicId, userId }).lean();
  if (!topic?.summary) throw new Error("Generate a topic summary first.");
  const raw = await callOpenRouter([
    { role: "system", content: "Extract accurate formulas and definitions from the supplied study summary. Do not invent facts. Return JSON only." },
    { role: "user", content: `Return {"items":[{"kind":"formula"|"definition","title":"short label","prompt":"recall question","answer":"concise answer"}]}, with at most 12 items. Topic: ${topic.name}. Summary:\n${topic.summary}` },
  ], undefined, true);
  const parsed = parseJsonResponse<{ items: { kind: string; title: string; prompt: string; answer: string }[] }>(raw);
  const items = (Array.isArray(parsed?.items) ? parsed.items : []).slice(0, 12).filter((x) => x && ["formula", "definition"].includes(x.kind) && typeof x.title === "string" && typeof x.prompt === "string" && typeof x.answer === "string");
  if (!items.length) throw new Error("No formulas or definitions could be extracted.");
  const created = await StudyMaterial.insertMany(items.map((x) => ({ userId, kind: x.kind, title: cleanText(x.title, 180), prompt: cleanText(x.prompt, 3000), answer: cleanText(x.answer, 6000), topicId, subject: topic.subject, chapter: topic.chapter })));
  return { count: created.length };
}

export async function createMockTestAction(input: { subject: string; chapter?: string; difficulty: string; questionCount: number }) {
  const userId = requireSessionUuid();
  await dbConnect();
  await enforcePersistentRateLimit(`mock-test-create:${userId}`, 10, 60 * 60 * 1000);
  const subject = cleanText(input.subject, 80);
  const chapter = cleanText(input.chapter, 100);
  const rawDifficulty = cleanText(input.difficulty, 30);
  const count = Math.min(20, Math.max(5, Math.floor(input.questionCount)));
  if (!subject || !["easy", "medium", "hard"].includes(rawDifficulty)) throw new Error("Choose a subject and valid difficulty.");
  const difficulty = rawDifficulty as "easy" | "medium" | "hard";
  const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const filter = {
    userId,
    subject: new RegExp(`^${escapeRegex(subject)}$`, "i"),
    chapter: chapter ? new RegExp(`^${escapeRegex(chapter)}$`, "i") : undefined,
    summary: { $exists: true, $ne: "" },
  };
  const topics = await Topic.find(filter).select("name chapter summary").limit(20).lean();
  if (!topics.length) throw new Error("Generate at least one topic summary for this subject first.");
  const context = topics.map((topic) => `${topic.name} (${topic.chapter}): ${topic.summary}`).join("\n\n").slice(0, 18000);
  const raw = await callOpenRouter([
    { role: "system", content: "Create fair exam practice questions grounded only in the supplied notes. Return valid JSON." },
    { role: "user", content: `Create exactly ${count} ${difficulty} short-answer questions for ${subject}${chapter ? `, ${chapter}` : ""}. Return {"questions":[{"question":"...","topic":"..."}]}. Notes:\n${context}` },
  ], undefined, true);
  const parsed = parseJsonResponse<{ questions: { question: string; topic: string }[] }>(raw);
  const questions = (Array.isArray(parsed?.questions) ? parsed.questions : []).slice(0, count)
    .filter((question) => question && typeof question.question === "string" && typeof question.topic === "string")
    .map((question) => ({ question: cleanText(question.question, 800), topic: cleanText(question.topic, 180) }))
    .filter((question) => question.question && question.topic);
  if (questions.length < 3) throw new Error("Question generation failed. Please try again.");
  const title = `${subject}${chapter ? ` · ${chapter}` : ""} practice`;
  const durationMinutes = Math.max(10, questions.length * 3);
  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + durationMinutes * 60 * 1000 + 60 * 1000);
  const session = await StudyTest.create({ userId, title, subject, chapter, difficulty, durationMinutes, questions, startedAt, expiresAt });
  return { id: session._id.toString(), title, subject, chapter, difficulty, durationMinutes, questions };
}
export async function submitMockTestAction(input: { testId: string; answers: string[]; confidence: number }) {
  const userId = requireSessionUuid();
  await dbConnect();
  await enforcePersistentRateLimit(`mock-test-submit:${userId}`, 10, 60 * 60 * 1000);
  if (!mongoose.isValidObjectId(input.testId) || !validConfidence(input.confidence) || !Array.isArray(input.answers)) throw new Error("Invalid mock test submission.");
  const session = await StudyTest.findOne({ _id: input.testId, userId, completedAt: { $exists: false }, expiresAt: { $gt: new Date() } }).lean();
  if (!session) throw new Error("This test has expired or was already submitted.");
  if (Date.now() > session.startedAt.getTime() + session.durationMinutes * 60 * 1000 + 60 * 1000) throw new Error("The time allowed for this test has ended.");
  const questions = session.questions.slice(0, 20).map((q) => ({ question: cleanText(q.question, 800), topic: cleanText(q.topic, 180) }));
  const answers = input.answers.slice(0, questions.length).map((a) => cleanText(a, 3000));
  if (input.answers.length !== questions.length) throw new Error("The answer count does not match the test.");
  const raw = await callOpenRouter([
    { role: "system", content: "Grade each student answer fairly against the question and subject context. Return JSON only." },
    { role: "user", content: `Grade these answers. Return {"scores":[{"score":0,"feedback":"...","weakArea":"..."}]} with one score 0-10 per item. Items: ${JSON.stringify(questions.map((q, i) => ({ ...q, answer: answers[i] || "" })))}` },
  ], undefined, true);
  const parsed = parseJsonResponse<{ scores: { score: number; feedback: string; weakArea: string }[] }>(raw);
  const scores = questions.map((_, i) => {
    const rawScore = parsed?.scores?.[i]?.score;
    return { score: Math.min(10, Math.max(0, Number(rawScore) || 0)), feedback: cleanText(parsed?.scores?.[i]?.feedback, 600) || "Review this answer and try again.", weakArea: cleanText(parsed?.scores?.[i]?.weakArea, 120) || "Recall" };
  });
  const score = Math.round(scores.reduce((sum, x) => sum + x.score, 0) / scores.length * 10);
  const weakAreas = scores.filter((x) => Number(x.score) < 6).map((x) => cleanText(x.weakArea, 120)).filter(Boolean);
  const claimed = await StudyTest.updateOne({ _id: session._id, userId, completedAt: { $exists: false } }, { $set: { completedAt: new Date() } });
  if (claimed.modifiedCount !== 1) throw new Error("This test was already submitted.");
  await StudyAttempt.create({ userId, kind: "mock-test", title: session.title, subject: session.subject, chapter: session.chapter, score, confidence: input.confidence, weakAreas, details: questions.map((q, i) => ({ ...q, answer: answers[i] || "", feedback: scores[i].feedback, score: scores[i].score })) });
  for (const [index, result] of scores.entries()) {
    if (Number(result.score) < 6) {
      await StudyMaterial.create({ userId, kind: "mistake", title: questions[index].topic, prompt: questions[index].question, answer: cleanText(result.feedback, 1000) || "Review the topic and retry.", reason: "Added from a mock test.", subject: session.subject, chapter: session.chapter, dueAt: new Date() });
    }
  }
  return { score, weakAreas, results: scores.map((x, i) => ({ ...questions[i], score: x.score, feedback: cleanText(x.feedback, 600) })) };
}

export async function coachExamAnswerAction(input: { question: string; answer: string; subject: string; confidence: number }) {
  const userId = requireSessionUuid();
  await dbConnect();
  await enforcePersistentRateLimit(`answer-coach:${userId}`, 30, 60 * 60 * 1000);
  const question = cleanText(input.question, 1200);
  const answer = cleanText(input.answer, 6000);
  const subject = cleanText(input.subject, 80);
  if (!question || !answer || !validConfidence(input.confidence)) throw new Error("Question, answer, and a confidence rating are required.");
  const raw = await callOpenRouter([
    { role: "system", content: "You are an exam answer coach. Be constructive and specific. Return JSON only." },
    { role: "user", content: `Assess this ${subject} exam answer. Return {"score":0-100,"structure":"...","clarity":"...","completeness":"...","accuracy":"...","improvedAnswer":"...","weakAreas":["..."]}. Question: ${question}\nAnswer: ${answer}` },
  ], undefined, true);
  const parsed = parseJsonResponse<any>(raw);
  const source = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  if (!source) throw new Error("The answer feedback could not be generated.");
  const score = Math.min(100, Math.max(0, Math.round(Number(source.score) || 0)));
  const result = {
    score,
    structure: cleanText(source.structure, 1200),
    clarity: cleanText(source.clarity, 1200),
    completeness: cleanText(source.completeness, 1200),
    accuracy: cleanText(source.accuracy, 1600),
    improvedAnswer: cleanText(source.improvedAnswer, 6000),
    weakAreas: Array.isArray(source.weakAreas) ? source.weakAreas.map((x: unknown) => cleanText(x, 120)).filter(Boolean).slice(0, 8) : [],
  };
  await StudyAttempt.create({ userId, kind: "answer-coach", title: question.slice(0, 160), subject, score, confidence: input.confidence, weakAreas: result.weakAreas, details: result });
  if (score < 60) await StudyMaterial.create({ userId, kind: "mistake", title: question.slice(0, 160), prompt: question, answer: result.improvedAnswer || result.accuracy || "Review your answer and retry.", reason: "Added from Exam Answer Coach.", subject, dueAt: new Date() });
  return result;
}

export async function explainAnotherWayAction(input: { topicId: string; mode: "simple" | "analogy" | "worked-example" | "diagram" }) {
  const userId = requireSessionUuid();
  await dbConnect();
  await enforcePersistentRateLimit(`explain:${userId}`, 30, 60 * 60 * 1000);
  if (!mongoose.isValidObjectId(input.topicId) || !["simple", "analogy", "worked-example", "diagram"].includes(input.mode)) throw new Error("Invalid explanation request.");
  const topic = await Topic.findOne({ _id: input.topicId, userId }).select("name subject summary classLevel").lean();
  if (!topic?.summary) throw new Error("Topic summary not found.");
  const raw = await callOpenRouter([
    { role: "system", content: "Re-explain a concept accurately and clearly, using only the supplied study summary. If asked for a diagram, return a small JSON node/edge diagram. Return JSON only." },
    { role: "user", content: `Mode: ${input.mode}. Topic: ${topic.name}, ${topic.subject}, ${topic.classLevel}. Return {"title":"...","explanation":"...","example":"...","diagram":{"nodes":[{"id":"1","label":"..."}],"edges":[{"from":"1","to":"2","label":"..."}]}}. Keep diagrams to at most 8 nodes and 10 edges. Summary:\n${topic.summary}` },
  ], undefined, true);
  const result = parseJsonResponse<any>(raw);
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("The explanation could not be generated.");
  if (typeof result.explanation !== "string" || !result.explanation.trim()) throw new Error("The explanation could not be generated.");
  const diagram = result.diagram && Array.isArray(result.diagram.nodes) && Array.isArray(result.diagram.edges)
    ? {
      nodes: result.diagram.nodes.slice(0, 8).filter((node: any) => node && typeof node === "object" && typeof node.label === "string").map((node: any, index: number) => ({ id: cleanText(node.id, 40) || String(index + 1), label: cleanText(node.label, 180) })),
      edges: result.diagram.edges.slice(0, 10).filter((edge: any) => edge && typeof edge === "object" && typeof edge.from === "string" && typeof edge.to === "string").map((edge: any) => ({ from: cleanText(edge.from, 40), to: cleanText(edge.to, 40), label: cleanText(edge.label, 100) })),
    }
    : undefined;
  return { title: cleanText(result.title, 160) || topic.name, explanation: cleanText(result.explanation, 5000), example: cleanText(result.example, 2500), diagram };
}

export async function teachBackAction(input: { topicId: string; explanation: string; confidence: number }) {
  const userId = requireSessionUuid();
  await dbConnect();
  await enforcePersistentRateLimit(`teach-back:${userId}`, 20, 60 * 60 * 1000);
  if (!mongoose.isValidObjectId(input.topicId) || !validConfidence(input.confidence)) throw new Error("Invalid teach-back submission.");
  const topic = await Topic.findOne({ _id: input.topicId, userId }).select("name subject chapter classLevel summary").lean();
  if (!topic) throw new Error("Topic not found.");
  const explanation = cleanText(input.explanation, 6000);
  if (!explanation) throw new Error("Explain the concept before submitting.");
  const report = await analyzeConceptExplanation({ conceptName: topic.name, userTranscript: explanation, classLevel: topic.classLevel });
  const score = Math.min(100, Math.max(0, Number(report.overallScore) || 0));
  await StudyAttempt.create({ userId, kind: "teach-back", title: topic.name, topicId: input.topicId, subject: topic.subject, chapter: topic.chapter, score, confidence: input.confidence, weakAreas: [], details: { feedback: report.feedback_summary } });
  return report;
}

export async function saveConceptRelationAction(input: { fromTopicId: string; toTopicId: string; relation: "prerequisite" | "related" }) {
  const userId = requireSessionUuid();
  await dbConnect();
  const { fromTopicId, toTopicId, relation } = input;
  if (!mongoose.isValidObjectId(fromTopicId) || !mongoose.isValidObjectId(toTopicId) || fromTopicId === toTopicId || !["prerequisite", "related"].includes(relation)) throw new Error("Invalid concept link.");
  const count = await Topic.countDocuments({ userId, _id: { $in: [fromTopicId, toTopicId] } });
  if (count !== 2) throw new Error("Both topics must belong to your account.");
  const relationDoc = await ConceptRelation.findOneAndUpdate({ userId, fromTopicId, toTopicId }, { relation }, { upsert: true, new: true, setDefaultsOnInsert: true });
  return { id: relationDoc._id.toString() };
}

export async function removeConceptRelationAction(id: string) {
  const userId = requireSessionUuid();
  await dbConnect();
  if (!mongoose.isValidObjectId(id)) throw new Error("Invalid concept link.");
  await ConceptRelation.deleteOne({ _id: id, userId });
  return { success: true };
}
