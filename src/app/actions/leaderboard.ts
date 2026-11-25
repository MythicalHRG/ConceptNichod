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

  const safeTimeframe: "all" | "week" | "month" =
    timeframe === "week" || timeframe === "month" ? timeframe : "all";
  const safeExamFilter =
    typeof examFilter === "string" ? examFilter.trim().slice(0, 100) : "All";

  const now = new Date();
  let timeCutoff: Date | null = null;
  if (safeTimeframe === "week") {
    timeCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (safeTimeframe === "month") {
    timeCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  // Base query for users (strict string guard prevents NoSQL operator injection)
  const userQuery: Record<string, string> = {};
  if (safeExamFilter && safeExamFilter !== "All") {
    userQuery.examFocus = safeExamFilter;
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

  // Stream the merged all-time activity history from MongoDB. This keeps the
  // original all-time scoring inputs while avoiding two full collections in memory.
  const activityMatch: Record<string, any> = { userId: { $in: userIds } };
  if (timeCutoff) activityMatch.createdAt = { $gte: timeCutoff };

  const activityPipeline: any[] = [
    { $match: activityMatch },
    {
      $project: {
        _id: 1,
        userId: 1,
        createdAt: 1,
        eventType: { $literal: "mirror" },
        title: { $ifNull: ["$conceptName", "Concept session"] },
        rawScore: "$overallScore",
        rawDuration: "$durationSeconds",
      },
    },
    {
      $unionWith: {
        coll: Topic.collection.name,
        pipeline: [
          { $match: activityMatch },
          {
            $project: {
              _id: 1,
              userId: 1,
              createdAt: 1,
              eventType: { $literal: "topic" },
              title: { $ifNull: ["$name", "Study topic"] },
              analysisScore: "$analysis.overallScore",
            },
          },
        ],
      },
    },
    { $sort: { userId: 1, createdAt: 1, eventType: 1, _id: 1 } },
  ];

  type ActivitySummary = {
    count: number;
    totalScore: number;
    totalDurationSeconds: number;
    sumX: number;
    sumY: number;
    sumXY: number;
    sumX2: number;
    qualityWeightedVolume: number;
    oralDefenseSeconds: number;
    trajectory: TrajectoryPoint[];
  };
  const activitySummaryByUser = new Map<string, ActivitySummary>();
  const activityCursor = ConceptMirror.aggregate(activityPipeline)
    .allowDiskUse(true)
    .cursor({ batchSize: 250 });

  try {
    for await (const event of activityCursor) {
      if (typeof event.userId !== "string") continue;
      const createdAt = new Date(event.createdAt);
      if (!Number.isFinite(createdAt.getTime())) continue;

      let score = 0;
      let durationSeconds = 0;
      if (event.eventType === "mirror") {
        const rawScore = event.rawScore;
        const rawDuration = event.rawDuration;
        if (!Number.isFinite(rawScore)) continue;
        score = Math.max(0, Math.min(100, rawScore));
        durationSeconds = Number.isFinite(rawDuration)
          ? Math.max(0, Math.min(86400, rawDuration))
          : 0;
      } else {
        // Only a completed, actually evaluated Topic contributes a performance
        // score. Completion state or saved answers are not evidence of mastery.
        const rawTopicScore = event.analysisScore;
        if (!Number.isFinite(rawTopicScore) || rawTopicScore < 0 || rawTopicScore > 100) {
          continue;
        }
        score = Math.max(0, Math.min(100, rawTopicScore));

        // Topic practice duration is not recorded. Do not invent 60/180 seconds;
        // only Concept Mirror contributes its measured recording duration.
        durationSeconds = 0;
      }

      let summary = activitySummaryByUser.get(event.userId);
      if (!summary) {
        summary = {
          count: 0,
          totalScore: 0,
          totalDurationSeconds: 0,
          sumX: 0,
          sumY: 0,
          sumXY: 0,
          sumX2: 0,
          qualityWeightedVolume: 0,
          oralDefenseSeconds: 0,
          trajectory: [],
        };
        activitySummaryByUser.set(event.userId, summary);
      }

      const x = summary.count + 1;
      summary.count = x;
      summary.totalScore += score;
      summary.totalDurationSeconds += durationSeconds;
      summary.sumX += x;
      summary.sumY += score;
      summary.sumXY += x * score;
      summary.sumX2 += x * x;
      if (score >= 80) summary.qualityWeightedVolume += 3.5;
      else if (score >= 60) summary.qualityWeightedVolume += 2.5;
      else if (score >= 40) summary.qualityWeightedVolume += 1.5;
      else summary.qualityWeightedVolume += 0.5;

      if (event.eventType === "mirror") {
        summary.oralDefenseSeconds += durationSeconds;
      }

      summary.trajectory.push({
        conceptIndex: x,
        score: Math.round(score),
        cumulativeAvg: Math.round((summary.totalScore / x) * 10) / 10,
        label: typeof event.title === "string"
          ? event.title.slice(0, 200)
          : event.eventType === "mirror" ? "Concept session" : "Study topic",
        timestamp: createdAt.toISOString(),
      });
      if (summary.trajectory.length > 100) summary.trajectory.shift();
    }
  } finally {
    await activityCursor.close().catch(() => {});
  }

  const streakDocs = await StudyStreak.find({ userId: { $in: userIds } })
    .select("userId currentStreak longestStreak lastActiveDate")
    .lean();
  const streakMap = new Map(streakDocs.map((s) => [s.userId, s]));
  const todayStr = getIstDateString(now);
  const yesterdayStr = getYesterdayIstDateString(now);

  const entries: LeaderboardEntry[] = [];

  for (const u of users) {
    const activity = activitySummaryByUser.get(u.uuid);
    const N = activity?.count || 0;
    const totalScore = activity?.totalScore || 0;
    const totalDurationSeconds = activity?.totalDurationSeconds || 0;
    const trajectory = activity?.trajectory || [];
    const sumX = activity?.sumX || 0;
    const sumY = activity?.sumY || 0;
    const sumXY = activity?.sumXY || 0;
    const sumX2 = activity?.sumX2 || 0;

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
      typeof streakDoc.lastActiveDate === "string" &&
      (streakDoc.lastActiveDate >= todayStr ||
        streakDoc.lastActiveDate === yesterdayStr);
    const currentStreakValue = isStreakActive ? streakDoc.currentStreak : 0;
    const longestStreakValue = streakDoc ? streakDoc.longestStreak : 0;
    const currentStreak = Number.isFinite(currentStreakValue) ? Math.max(0, Math.min(3650, currentStreakValue)) : 0;
    const longestStreak = Number.isFinite(longestStreakValue) ? Math.max(0, Math.min(3650, longestStreakValue)) : 0;

    // The score-volume weight is accumulated for every historical activity while streaming.
    const conceptsWeight = Math.min(activity?.qualityWeightedVolume || 0, 300);

    // 2. Bayesian / Credibility-Smoothed Performance Weight:
    // Smooths accuracy by sample size so 1 attempt cannot outrank sustained high performance
    const credibilityFactor = N / (N + 3);
    const performanceWeight = (avgScore * 0.4) * credibilityFactor;

    // 3. Timeframe-Bounded Consistency (Streak):
    // Bound streak points to timeframe so historical streaks do not skew weekly/monthly leaderboards
    let maxTimeframeDays = 100;
    if (safeTimeframe === "week") maxTimeframeDays = 7;
    else if (safeTimeframe === "month") maxTimeframeDays = 30;
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
    const oralSeconds = activity?.oralDefenseSeconds || 0;
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
    const aRaw = userMap.get(a.username.toLowerCase())?.createdAt
      ? new Date(userMap.get(a.username.toLowerCase())!.createdAt).getTime()
      : 0;
    const bRaw = userMap.get(b.username.toLowerCase())?.createdAt
      ? new Date(userMap.get(b.username.toLowerCase())!.createdAt).getTime()
      : 0;
    const aCreated = Number.isFinite(aRaw) ? aRaw : 0;
    const bCreated = Number.isFinite(bRaw) ? bRaw : 0;
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
