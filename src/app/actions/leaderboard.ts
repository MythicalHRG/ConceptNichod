"use server";

import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import ConceptMirror from "@/models/ConceptMirror";
import Topic from "@/models/Topic";
import StudyStreak from "@/models/StudyStreak";
import { verifySessionCookie } from "@/lib/session";
import { getIstDateString, getYesterdayIstDateString } from "@/lib/streak";

export interface TrajectoryPoint {
  conceptIndex: number;
  score: number;
  cumulativeAvg: number;
  label: string;
  timestamp: string;
}

export interface LeaderboardEntry {
  rank: number;
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
  const rawSession = (await cookies()).get("user_session")?.value;
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
    .select("userId name analysis practiceStatus savedWrittenAnswers savedSpokenAnswers createdAt")
    .sort({ createdAt: 1 })
    .lean();

  // Fetch streaks
  const streakDocs = await StudyStreak.find({ userId: { $in: userIds } }).lean();
  const streakMap = new Map(streakDocs.map((s) => [s.userId, s]));

  const todayStr = getIstDateString(now);
  const yesterdayStr = getYesterdayIstDateString(now);

  // Group activities per user & track authentic oral defense duration
  const userActivities = new Map<
    string,
    Array<{
      title: string;
      score: number;
      durationSeconds: number;
      createdAt: Date;
    }>
  >();
  const userOralDefenseSeconds = new Map<string, number>();

  for (const session of mirrorSessions) {
    const rawScore = session.overallScore;
    const rawDuration = session.durationSeconds;
    const createdAt = new Date(session.createdAt);
    if (!Number.isFinite(rawScore) || !Number.isFinite(createdAt.getTime()) || typeof session.userId !== "string") continue;
    const score = Math.max(0, Math.min(100, rawScore));
    const dur = Number.isFinite(rawDuration) ? Math.max(0, Math.min(86400, rawDuration)) : 0;
    const list = userActivities.get(session.userId) || [];
    userOralDefenseSeconds.set(
      session.userId,
      (userOralDefenseSeconds.get(session.userId) || 0) + dur
    );
    list.push({
      title: typeof session.conceptName === "string" ? session.conceptName.slice(0, 200) : "Concept session",
      score,
      durationSeconds: dur,
      createdAt,
    });
    userActivities.set(session.userId, list);
  }

  for (const topic of topicSessions) {
    // Only count topics where the student has actually practiced or completed an evaluation
    const hasAnalysisScore = topic.analysis && Number.isFinite(topic.analysis.overallScore);
    const isCompleted = topic.practiceStatus === "completed";
    const isInProgress = topic.practiceStatus === "in_progress";
    const hasAnswers =
      (Array.isArray(topic.savedWrittenAnswers) &&
        topic.savedWrittenAnswers.some((a: unknown) => typeof a === "string" && a.trim().length > 0)) ||
      (Array.isArray(topic.savedSpokenAnswers) &&
        topic.savedSpokenAnswers.some((a: unknown) => typeof a === "string" && a.trim().length > 0));
    const topicCreatedAt = new Date(topic.createdAt);
    if (!Number.isFinite(topicCreatedAt.getTime())) continue;

    // Exclude untouched drafts (not_started without analysis, or in_progress without any answers)
    if (!hasAnalysisScore && !isCompleted && (!isInProgress || !hasAnswers)) {
      continue;
    }

    let score = 0;
    if (hasAnalysisScore) {
      score = topic.analysis.overallScore;
    } else if (isCompleted) {
      score = 70;
    } else if (isInProgress) {
      score = 40;
    }

    const list = userActivities.get(topic.userId) || [];
    list.push({
      title: typeof topic.name === "string" ? topic.name.slice(0, 200) : "Study topic",
      score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0,
      durationSeconds: isCompleted ? 180 : 60,
      createdAt: topicCreatedAt,
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

    // Sums for linear regression: X = index (1..N), Y = score
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
    const currentStreakValue = isStreakActive ? streakDoc.currentStreak : 0;
    const longestStreakValue = streakDoc ? streakDoc.longestStreak : 0;
    const currentStreak = Number.isFinite(currentStreakValue) ? Math.max(0, Math.min(3650, currentStreakValue)) : 0;
    const longestStreak = Number.isFinite(longestStreakValue) ? Math.max(0, Math.min(3650, longestStreakValue)) : 0;

    // 1. Quality & Mastery-Weighted Volume:
    // Reward depth of mastery over superficial churning
    let qualityWeightedVolume = 0;
    for (const item of rawList) {
      if (item.score >= 80) qualityWeightedVolume += 3.5;
      else if (item.score >= 60) qualityWeightedVolume += 2.5;
      else if (item.score >= 40) qualityWeightedVolume += 1.5;
      else qualityWeightedVolume += 0.5;
    }
    const conceptsWeight = Math.min(qualityWeightedVolume, 300);

    // 2. Bayesian / Credibility-Smoothed Performance Weight:
    // Smooths accuracy by sample size so 1 attempt cannot outrank sustained high performance
    const credibilityFactor = N / (N + 3);
    const performanceWeight = (avgScore * 0.4) * credibilityFactor;

    // 3. Timeframe-Bounded Consistency (Streak):
    // Bound streak points to timeframe so historical streaks do not skew weekly/monthly leaderboards
    let maxTimeframeDays = 100;
    if (timeframe === "week") maxTimeframeDays = 7;
    else if (timeframe === "month") maxTimeframeDays = 30;
    const effectiveStreak = Math.min(currentStreak, maxTimeframeDays);
    const streakWeight = effectiveStreak * 2.0;

    // 4. Learning Progression Velocity (with low-sample confidence damping):
    // Damps volatile low-N slopes (N < 3 has zero slope weight, smoothly phases in)
    const slopeConfidence = Math.min(1, Math.max(0, (N - 2) / 5));
    const effectiveVelocity = slope * Math.log10(N + 1) * slopeConfidence;
    const velocityWeight = Math.max(-10, Math.min(30, effectiveVelocity)) * 2.0;

    // 5. Mastery Plateau Bonus (Solves the Ceiling Effect for Elite Students):
    // High-performing students (avgScore >= 85%) naturally have near-zero slope because they are already near ceiling.
    // Award an excellence plateau bonus so elite consistent performers are recognized fairly:
    let plateauBonus = 0;
    if (avgScore >= 85 && N >= 3) {
      plateauBonus = Math.min(25, (avgScore - 80) * 1.5 * Math.min(1, N / 5));
    }

    // 6. Oral Defense Bonus from authentic Concept Mirror sessions:
    const oralSeconds = userOralDefenseSeconds.get(u.uuid) || 0;
    const oralBonus = Math.min(oralSeconds / 60, 20) * 0.5;

    // Composite Rank Score: guaranteed >= 0, rounded to 2 decimal places
    const rawRankScore =
      conceptsWeight +
      performanceWeight +
      streakWeight +
      velocityWeight +
      plateauBonus +
      oralBonus;

    const rankScore = N > 0 ? Math.max(0, Math.round(rawRankScore * 100) / 100) : 0;

    entries.push({
      rank: 0,
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
  // 4. Accuracy / Avg Score (desc)
  // 5. Total Concept Mirror defense seconds (desc)
  // 6. Earlier user registration timestamp (asc)
  const userMap = new Map(users.map((u) => [u.username.toLowerCase(), u]));

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
    if (Math.abs((b.avgScore || 0) - (a.avgScore || 0)) > 0.01) {
      return (b.avgScore || 0) - (a.avgScore || 0);
    }
    if (b.totalDurationSeconds !== a.totalDurationSeconds) {
      return b.totalDurationSeconds - a.totalDurationSeconds;
    }
    const aCreated = userMap.get(a.username.toLowerCase())?.createdAt ? new Date(userMap.get(a.username.toLowerCase())!.createdAt).getTime() : 0;
    const bCreated = userMap.get(b.username.toLowerCase())?.createdAt ? new Date(userMap.get(b.username.toLowerCase())!.createdAt).getTime() : 0;
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
