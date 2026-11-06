"use server";

import mongoose from "mongoose";
import dbConnect from "@/lib/mongoose";
import { requireSessionUuid } from "@/lib/server-auth";
import StudyGroup from "@/models/StudyGroup";
import CommunityPost, { type CommunityPostKind } from "@/models/CommunityPost";
import AccountabilityProfile from "@/models/AccountabilityProfile";
import User from "@/models/User";
import { enforcePersistentRateLimit } from "@/lib/persistent-rate-limit";

const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const safeGroup = (group: any, userId: string) => ({ id: group._id.toString(), name: group.name, description: group.description, subject: group.subject, examFocus: group.examFocus, schedule: group.schedule, memberCount: group.memberIds.length, isOwner: group.ownerId === userId, createdAt: group.createdAt });
const safePost = (post: any, author: any, userId: string) => ({ id: post._id.toString(), kind: post.kind, title: post.title, body: post.body, url: post.url, parentId: post.parentId, groupId: post.groupId, topicLabels: post.topicLabels, quizQuestions: post.quizQuestions, startsAt: post.startsAt, durationMinutes: post.durationMinutes, helpfulCount: post.helpfulBy.length, isHelpful: post.helpfulBy.includes(userId), createdAt: post.createdAt, author: author ? { username: author.username } : { username: "Student" } });

export async function getCommunityDataAction() {
  const userId = requireSessionUuid();
  await dbConnect();
  const [memberGroups, publicQuestions, profile] = await Promise.all([
    StudyGroup.find({ memberIds: userId }).sort({ createdAt: -1 }).limit(100).lean(),
    CommunityPost.find({ kind: "question", groupId: { $exists: false } }).sort({ createdAt: -1 }).limit(50).lean(),
    AccountabilityProfile.findOne({ userId }).lean(),
  ]);
  const publicGroups = await StudyGroup.find({ memberIds: { $ne: userId } }).sort({ createdAt: -1 }).limit(50).lean();
  const groups = memberGroups.map((group) => safeGroup(group, userId));
  const groupIds = memberGroups.map((group) => group._id.toString());
  const groupPosts = groupIds.length ? await CommunityPost.find({ groupId: { $in: groupIds } }).sort({ createdAt: -1 }).limit(250).lean() : [];
  const publicResources = await CommunityPost.find({ kind: "resource", groupId: { $exists: false } }).sort({ createdAt: -1 }).limit(100).lean();
  const allPosts = [...groupPosts, ...publicResources];
  const allAuthors = await User.find({ uuid: { $in: allPosts.map((post) => post.authorId) } }).select("uuid username fullName classLevel examFocus shareLocation city shareSocialLinks snapchat instagram bio").lean();
  const authorsById = new Map(allAuthors.map((user) => [user.uuid, user]));
  const visiblePosts = await Promise.all(publicQuestions.map(async (post) => {
    const author = await User.findOne({ uuid: post.authorId }).select("uuid username fullName classLevel examFocus shareLocation shareSocialLinks").lean();
    const answers = await CommunityPost.find({ parentId: post._id.toString(), kind: "answer", groupId: { $exists: false } }).sort({ createdAt: 1 }).limit(30).lean();
    const answerAuthors = await User.find({ uuid: { $in: answers.map((a) => a.authorId) } }).select("uuid username fullName classLevel examFocus").lean();
    const byId = new Map(answerAuthors.map((u) => [u.uuid, u]));
    return { ...safePost(post, author, userId), answers: answers.map((answer) => safePost(answer, byId.get(answer.authorId), userId)) };
  }));
  const accountabilityProfiles = await getAccountabilityPartnersFor(userId);
  return JSON.parse(JSON.stringify({ groups, publicGroups: publicGroups.map((group) => safeGroup(group, userId)), groupPosts: allPosts.map((post) => safePost(post, authorsById.get(post.authorId), userId)), resources: publicResources.map((post) => safePost(post, authorsById.get(post.authorId), userId)), questions: visiblePosts, accountabilityProfile: profile ? { enabled: profile.enabled, weeklyGoal: profile.weeklyGoal, schedule: profile.schedule } : null, accountabilityProfiles }));
}

async function getAccountabilityPartnersFor(userId: string) {
  const mine = await AccountabilityProfile.findOne({ userId, enabled: true }).lean();
  if (!mine) return [];
  const profiles = await AccountabilityProfile.find({ userId: { $ne: userId }, enabled: true }).limit(50).lean();
  const users = await User.find({ uuid: { $in: profiles.map((profile) => profile.userId) } }).select("uuid username fullName classLevel examFocus").lean();
  const profileMap = new Map(profiles.map((profile) => [profile.userId, profile]));
  return users.map((user) => ({ username: user.username, fullName: user.fullName, classLevel: user.classLevel, examFocus: user.examFocus, weeklyGoal: profileMap.get(user.uuid)?.weeklyGoal, schedule: profileMap.get(user.uuid)?.schedule }));
}

export async function getGroupPostsAction(groupId: string) {
  const userId = requireSessionUuid();
  await dbConnect();
  if (!mongoose.isValidObjectId(groupId) || !await StudyGroup.exists({ _id: groupId, memberIds: userId })) throw new Error("Join the group to view its activity.");
  const posts = await CommunityPost.find({ groupId }).sort({ createdAt: -1 }).limit(100).lean();
  const authors = await User.find({ uuid: { $in: posts.map((post) => post.authorId) } }).select("uuid username fullName classLevel examFocus").lean();
  const byId = new Map(authors.map((user) => [user.uuid, user]));
  return JSON.parse(JSON.stringify(posts.map((post) => safePost(post, byId.get(post.authorId), userId))));
}

export async function createStudyGroupAction(input: { name: string; description: string; subject: string; examFocus?: string; schedule?: string }) {
  const userId = requireSessionUuid();
  await dbConnect();
  await enforcePersistentRateLimit(`group-create:${userId}`, 5, 60 * 60 * 1000);
  const name = text(input.name, 100), description = text(input.description, 1000), subject = text(input.subject, 80);
  if (!name || !description || !subject) throw new Error("Group name, description, and subject are required.");
  const group = await StudyGroup.create({ name, description, subject, examFocus: text(input.examFocus, 80), schedule: text(input.schedule, 160), ownerId: userId, memberIds: [userId] });
  return { id: group._id.toString() };
}

export async function joinStudyGroupAction(groupId: string) {
  const userId = requireSessionUuid();
  await dbConnect();
  if (!mongoose.isValidObjectId(groupId)) throw new Error("Invalid group.");
  const group = await StudyGroup.findByIdAndUpdate(groupId, { $addToSet: { memberIds: userId } }, { new: true });
  if (!group) throw new Error("Group not found.");
  return { success: true };
}

export async function leaveStudyGroupAction(groupId: string) {
  const userId = requireSessionUuid();
  await dbConnect();
  if (!mongoose.isValidObjectId(groupId)) throw new Error("Invalid group.");
  const group = await StudyGroup.findOne({ _id: groupId, memberIds: userId });
  if (!group) throw new Error("Group membership not found.");
  group.memberIds = group.memberIds.filter((id) => id !== userId);
  if (group.ownerId === userId) {
    if (!group.memberIds.length) throw new Error("Delete this empty group to close it.");
    group.ownerId = group.memberIds[0];
  }
  await group.save();
  return { success: true };
}

export async function deleteStudyGroupAction(groupId: string) {
  const userId = requireSessionUuid();
  await dbConnect();
  if (!mongoose.isValidObjectId(groupId)) throw new Error("Invalid group.");
  const group = await StudyGroup.findOne({ _id: groupId, ownerId: userId });
  if (!group) throw new Error("Only the group owner can delete it.");
  await Promise.all([CommunityPost.deleteMany({ groupId }), group.deleteOne()]);
  return { success: true };
}

export async function createCommunityPostAction(input: { kind: CommunityPostKind; title: string; body: string; groupId?: string; parentId?: string; url?: string; topicLabels?: string[]; quizQuestions?: string[]; startsAt?: string; durationMinutes?: number }) {
  const userId = requireSessionUuid();
  await dbConnect();
  await enforcePersistentRateLimit(`community-post:${userId}`, 15, 10 * 60 * 1000);
  if (!["question", "answer", "resource", "session"].includes(input.kind)) throw new Error("Invalid post type.");
  const title = text(input.title, 180), body = text(input.body, 5000);
  if (!title || !body) throw new Error("Title and details are required.");
  if (input.groupId) {
    if (!mongoose.isValidObjectId(input.groupId) || !await StudyGroup.exists({ _id: input.groupId, memberIds: userId })) throw new Error("Join the group before posting there.");
  }
  if (input.kind === "answer") {
    if (!input.parentId || !mongoose.isValidObjectId(input.parentId)) throw new Error("Choose a question to answer.");
    const parent = await CommunityPost.findOne({ _id: input.parentId, kind: "question", ...(input.groupId ? { groupId: input.groupId } : { groupId: { $exists: false } }) });
    if (!parent) throw new Error("Question not found.");
    if (parent.groupId && !await StudyGroup.exists({ _id: parent.groupId, memberIds: userId })) throw new Error("Join the group before answering.");
  }
  let url: string | undefined;
  if (input.kind === "resource" && input.url) {
    try {
      const parsed = new URL(input.url);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Only web links can be shared.");
      url = parsed.toString();
    } catch { throw new Error("Enter a valid http or https resource link."); }
  }
  const topicLabels = (Array.isArray(input.topicLabels) ? input.topicLabels : []).map((value) => text(value, 120)).filter(Boolean).slice(0, 20);
  const quizQuestions = (Array.isArray(input.quizQuestions) ? input.quizQuestions : []).map((value) => text(value, 600)).filter(Boolean).slice(0, 20);
  const startsAt = input.startsAt ? new Date(input.startsAt) : undefined;
  if (startsAt && Number.isNaN(startsAt.getTime())) throw new Error("Enter a valid session start time.");
  const post = await CommunityPost.create({
    kind: input.kind, title, body, authorId: userId, groupId: input.groupId,
    parentId: input.parentId, url, topicIds: [], topicLabels, quizQuestions,
    startsAt: input.kind === "session" ? startsAt : undefined,
    durationMinutes: input.kind === "session" ? Math.max(1, Math.min(360, Math.floor(input.durationMinutes || 30))) : undefined,
  });
  return { id: post._id.toString() };
}

export async function markAnswerHelpfulAction(postId: string) {
  const userId = requireSessionUuid();
  await dbConnect();
  if (!mongoose.isValidObjectId(postId)) throw new Error("Invalid answer.");
  const answer = await CommunityPost.findOne({ _id: postId, kind: "answer" });
  if (!answer) throw new Error("Answer not found.");
  if (answer.groupId && !await StudyGroup.exists({ _id: answer.groupId, memberIds: userId })) throw new Error("Join the group before viewing this answer.");
  answer.helpfulBy = answer.helpfulBy.includes(userId) ? answer.helpfulBy.filter((id) => id !== userId) : [...answer.helpfulBy, userId];
  await answer.save();
  return { helpful: answer.helpfulBy.includes(userId) };
}

export async function setAccountabilityProfileAction(input: { enabled: boolean; weeklyGoal: string; schedule: string }) {
  const userId = requireSessionUuid();
  await dbConnect();
  await enforcePersistentRateLimit(`accountability:${userId}`, 6, 60 * 60 * 1000);
  const weeklyGoal = text(input.weeklyGoal, 240), schedule = text(input.schedule, 160);
  if (!weeklyGoal || !schedule) throw new Error("Add a weekly goal and study schedule.");
  await AccountabilityProfile.findOneAndUpdate({ userId }, { enabled: input.enabled === true, weeklyGoal, schedule }, { upsert: true, new: true, setDefaultsOnInsert: true });
  return { success: true };
}

export async function getAccountabilityPartnersAction() {
  const userId = requireSessionUuid();
  await dbConnect();
  await dbConnect();
  return getAccountabilityPartnersFor(userId);
}
