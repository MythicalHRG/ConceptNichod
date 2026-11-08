"use server";

import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import ConceptMirror from "@/models/ConceptMirror";
import Topic from "@/models/Topic";
import StudyStreak from "@/models/StudyStreak";
import { verifySessionCookie } from "@/lib/session";

export interface TrajectoryPoint {
  conceptIndex: number;
  score: number;
  cumulativeAvg: number;
  label: string;
  timestamp: string;
}

export interface LeaderboardEntry {
  rank: number;
  uuid: string;
  username: string;
  fullName: string;
  examFocus: string;
  classLevel: string;
  city: string;
  conceptsCovered: number;
  avgScore: number;
  slope: number;
  velocity: number;
  currentStreak: number;
  longestStreak: number;
  totalDurationSeconds: number;
  rankScore: number;
  trajectory: TrajectoryPoint[];
  isCurrentUser: boolean;
}

export async function getLeaderboardDataAction(
  timeframe: "all" | "week" | "month" = "all",
  examFilter: string = "All"
) {
  await dbConnect();
  const rawSession = cookies().get("user_session")?.value;
  const currentUuid = verifySessionCookie(rawSession);

  const now = new Date();
  let timeCutoff: Date | null = null;
  if (timeframe === "week") {
    timeCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (timeframe === "month") {
    timeCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  // Base query for users
  const userQuery: any = {};
  if (examFilter && examFilter !== "All") {
    userQuery.examFocus = examFilter;
  }

  const users = await User.find(userQuery)
    .select("uuid username fullName examFocus classLevel city createdAt")
    .lean();

  if (users.length === 0) {
    return {
      entries: [],
      podium: [],
      currentUserEntry: null,
      topTrajectories: [],
    };
  }

  const userIds = users.map((u) => u.uuid);

  // Fetch all ConceptMirror sessions for these users
  const mirrorQuery: any = { userId: { $in: userIds } };
  if (timeCutoff) {
    mirrorQuery.createdAt = { $gte: timeCutoff };
  }
  const mirrorSessions = await ConceptMirror.find(mirrorQuery)
    .select("userId conceptName overallScore durationSeconds createdAt")
    .sort({ createdAt: 1 })
    .lean();

  // Fetch all completed Topics for these users
  const topicQuery: any = { userId: { $in: userIds } };
  if (timeCutoff) {
    topicQuery.createdAt = { $gte: timeCutoff };
  }
  const topicSessions = await Topic.find(topicQuery)
    .select("userId name analysis practiceStatus createdAt")
    .sort({ createdAt: 1 })
    .lean();

  // Fetch streaks
  const streakDocs = await StudyStreak.find({ userId: { $in: userIds } }).lean();
  const streakMap = new Map(streakDocs.map((s) => [s.userId, s]));

  const todayStr = now.toISOString().slice(0, 10);
  const yesterdayStr = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // Group activities per user
  const userActivities = new Map<
    string,
    Array<{
      title: string;
      score: number;
      durationSeconds: number;
      createdAt: Date;
    }>
  >();

  for (const session of mirrorSessions) {
    const list = userActivities.get(session.userId) || [];
    list.push({
      title: session.conceptName,
      score: Math.min(100, Math.max(0, session.overallScore || 0)),
      durationSeconds: session.durationSeconds || 0,
      createdAt: new Date(session.createdAt),
    });
    userActivities.set(session.userId, list);
  }

  for (const topic of topicSessions) {
    // Determine score from topic analysis if present, or assign baseline mastery for completed topic
    let score = 75;
    if (topic.analysis && typeof topic.analysis.overallScore === "number") {
      score = topic.analysis.overallScore;
    } else if (topic.practiceStatus === "completed") {
      score = 80;
    }
    const list = userActivities.get(topic.userId) || [];
    list.push({
      title: topic.name,
      score: Math.min(100, Math.max(0, score)),
      durationSeconds: 120,
      createdAt: new Date(topic.createdAt),
    });
    userActivities.set(topic.userId, list);
  }

  const entries: LeaderboardEntry[] = [];

  for (const u of users) {
    const rawList = userActivities.get(u.uuid) || [];
    rawList.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const N = rawList.length;
    let totalScore = 0;
    let totalDurationSeconds = 0;
    const trajectory: TrajectoryPoint[] = [];

    // Sums for linear regression: X = index (1..N), Y = score or running average
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < N; i++) {
      const item = rawList[i];
      const x = i + 1;
      totalScore += item.score;
      totalDurationSeconds += item.durationSeconds;
      const runningAvg = Math.round((totalScore / x) * 10) / 10;

      sumX += x;
      sumY += item.score;
      sumXY += x * item.score;
      sumX2 += x * x;

      trajectory.push({
        conceptIndex: x,
        score: Math.round(item.score),
        cumulativeAvg: runningAvg,
        label: item.title,
        timestamp: item.createdAt.toISOString(),
      });
    }

    // Slope calculation m = (N*sumXY - sumX*sumY) / (N*sumX2 - sumX*sumX)
    let slope = 0;
    if (N >= 2) {
      const numerator = N * sumXY - sumX * sumY;
      const denominator = N * sumX2 - sumX * sumX;
      if (denominator !== 0) {
        slope = Math.round((numerator / denominator) * 100) / 100;
      }
    }

    const avgScore = N > 0 ? Math.round((totalScore / N) * 10) / 10 : 0;
    const velocity = Math.round(slope * Math.log10(N + 1) * 100) / 100;

    const streakDoc = streakMap.get(u.uuid);
    const isStreakActive =
      streakDoc &&
      (streakDoc.lastActiveDate === todayStr ||
        streakDoc.lastActiveDate === yesterdayStr);
    const currentStreak = isStreakActive ? streakDoc.currentStreak : 0;
    const longestStreak = streakDoc ? streakDoc.longestStreak : 0;

    // Composite Rank Score:
    // Performance weight (40%) + Concepts volume weight (up to 60 concepts) + Streak (1.5x) + Positive Velocity (2.0x)
    const conceptsWeight = Math.min(N, 60) * 0.6;
    const performanceWeight = avgScore * 0.4;
    const streakWeight = currentStreak * 1.5;
    const velocityWeight = Math.max(-10, Math.min(30, velocity)) * 2.0;

    const rankScore =
      Math.round(
        (performanceWeight + conceptsWeight + streakWeight + velocityWeight) * 100
      ) / 100;

    entries.push({
      rank: 0,
      uuid: u.uuid,
      username: u.username,
      fullName: u.fullName,
      examFocus: u.examFocus || "General",
      classLevel: u.classLevel || "",
      city: u.city || "",
      conceptsCovered: N,
      avgScore,
      slope,
      velocity,
      currentStreak,
      longestStreak,
      totalDurationSeconds,
      rankScore,
      trajectory,
      isCurrentUser: u.uuid === currentUuid,
    });
  }

  // Sort with deterministic tie-breaking hierarchy:
  // 1. Composite Rank Score (desc)
  // 2. Current active study streak (desc)
  // 3. Concepts mastered N (desc)
  // 4. Total Concept Mirror defense seconds (desc)
  // 5. Earlier user registration timestamp (asc)
  const userMap = new Map(users.map((u) => [u.uuid, u]));

  entries.sort((a, b) => {
    if (Math.abs(b.rankScore - a.rankScore) > 0.001) {
      return b.rankScore - a.rankScore;
    }
    if (b.currentStreak !== a.currentStreak) {
      return b.currentStreak - a.currentStreak;
    }
    if (b.conceptsCovered !== a.conceptsCovered) {
      return b.conceptsCovered - a.conceptsCovered;
    }
    if (b.totalDurationSeconds !== a.totalDurationSeconds) {
      return b.totalDurationSeconds - a.totalDurationSeconds;
    }
    const aCreated = userMap.get(a.uuid)?.createdAt ? new Date(userMap.get(a.uuid)!.createdAt).getTime() : 0;
    const bCreated = userMap.get(b.uuid)?.createdAt ? new Date(userMap.get(b.uuid)!.createdAt).getTime() : 0;
    return aCreated - bCreated;
  });

  // Assign ranks
  entries.forEach((entry, idx) => {
    entry.rank = idx + 1;
  });

  const podium = entries.slice(0, 3);
  const currentUserEntry = entries.find((e) => e.isCurrentUser) || null;

  // Trajectories to chart: top 3 + current user
  const topTrajectories = entries
    .filter((e) => e.rank <= 3 || e.isCurrentUser)
    .map((e) => ({
      username: e.username,
      fullName: e.fullName,
      rank: e.rank,
      slope: e.slope,
      velocity: e.velocity,
      isCurrentUser: e.isCurrentUser,
      trajectory: e.trajectory,
    }));

  return {
    entries,
    podium,
    currentUserEntry,
    topTrajectories,
  };
}
