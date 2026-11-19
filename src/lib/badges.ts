import dbConnect from "@/lib/mongoose";
import ConceptMirror from "@/models/ConceptMirror";
import Topic from "@/models/Topic";
import StudyStreak from "@/models/StudyStreak";
import { getIstDateString, getYesterdayIstDateString } from "@/lib/streak";
import { getLeaderboardDataAction } from "@/app/actions/leaderboard";

export interface UserBadge {
  id: string;
  name: string;
  shortLabel: string;
  description: string;
  category: "weekly" | "monthly" | "overall" | "streak" | "velocity" | "defense";
  level: 1 | 2 | 3 | 4 | 5;
  priorityWeight: number;
  icon: "Crown" | "Trophy" | "Medal" | "Award" | "Flame" | "Zap" | "BrainCircuit";
  tierClass: string;
  metricValue: string;
  periodLabel: string;
  active: boolean;
}

export async function computeUserBadges(userUuid: string, username: string): Promise<{
  badges: UserBadge[];
  topBadge: UserBadge | null;
}> {
  const cleanUuid = typeof userUuid === "string" ? userUuid.trim() : "";
  const normalizedUsername = typeof username === "string" ? username.trim().toLowerCase() : "";
  if (!cleanUuid) {
    return { badges: [], topBadge: null };
  }

  await dbConnect();

  const badges: UserBadge[] = [];

  const [leaderboardResult, streakResult, topicsResult, mirrorResult] = await Promise.allSettled([
    normalizedUsername
      ? Promise.all([
          getLeaderboardDataAction("week", "All"),
          getLeaderboardDataAction("month", "All"),
          getLeaderboardDataAction("all", "All"),
        ])
      : Promise.resolve(null),
    StudyStreak.findOne({ userId: cleanUuid })
      .select("currentStreak lastActiveDate")
      .lean(),
    Topic.find({ userId: cleanUuid })
      .select("analysis.overallScore createdAt")
      .sort({ createdAt: 1 })
      .lean(),
    ConceptMirror.find({ userId: cleanUuid })
      .select("durationSeconds overallScore")
      .lean(),
  ]);

  // 1. Leaderboard Standings for Weekly, Monthly, and Overall
  if (leaderboardResult.status === "fulfilled" && leaderboardResult.value) {
    const [weeklyBoard, monthlyBoard, overallBoard] = leaderboardResult.value;
    const findUserEntry = (board: { entries?: Array<{ username?: string; rank: number; conceptsCovered: number }> } | null | undefined) =>
      Array.isArray(board?.entries)
        ? board.entries.find(
            (e) =>
              typeof e?.username === "string" &&
              e.username.trim().toLowerCase() === normalizedUsername
          )
        : undefined;

    const weeklyEntry = findUserEntry(weeklyBoard);
    const monthlyEntry = findUserEntry(monthlyBoard);
    const overallEntry = findUserEntry(overallBoard);

    // Weekly Performer Badge (single highest earned for this cycle)
    if (weeklyEntry && weeklyEntry.conceptsCovered > 0 && Number.isFinite(weeklyEntry.rank) && weeklyEntry.rank >= 1) {
      if (weeklyEntry.rank === 1) {
        badges.push({
          id: "weekly-1",
          name: "Weekly #1 Champion",
          shortLabel: "#1 This Week",
          description: "Rank #1 top performer on the weekly learning velocity leaderboard.",
          category: "weekly",
          level: 5,
          priorityWeight: 9500,
          icon: "Crown",
          tierClass: "badge-gold",
          metricValue: "Rank #1",
          periodLabel: "Weekly",
          active: true,
        });
      } else if (weeklyEntry.rank <= 3) {
        badges.push({
          id: "weekly-podium",
          name: `Weekly Podium (#${weeklyEntry.rank})`,
          shortLabel: `Top 3 This Week`,
          description: `Rank #${weeklyEntry.rank} performer on the weekly leaderboard.`,
          category: "weekly",
          level: 4,
          priorityWeight: 8500 - weeklyEntry.rank * 10,
          icon: "Medal",
          tierClass: "badge-silver",
          metricValue: `#${weeklyEntry.rank}`,
          periodLabel: "Weekly",
          active: true,
        });
      } else if (weeklyEntry.rank <= 10) {
        badges.push({
          id: "weekly-top-10",
          name: `Weekly Top 10 (#${weeklyEntry.rank})`,
          shortLabel: `Top 10 This Week`,
          description: `Rank #${weeklyEntry.rank} on this week's learning leaderboard.`,
          category: "weekly",
          level: 3,
          priorityWeight: 7500 - weeklyEntry.rank * 5,
          icon: "Award",
          tierClass: "badge-bronze",
          metricValue: `#${weeklyEntry.rank}`,
          periodLabel: "Weekly",
          active: true,
        });
      } else if (weeklyEntry.rank <= 25) {
        badges.push({
          id: "weekly-top-25",
          name: `Weekly Top 25 (#${weeklyEntry.rank})`,
          shortLabel: `Top 25 This Week`,
          description: `Top 25 active learner this week.`,
          category: "weekly",
          level: 2,
          priorityWeight: 6500 - weeklyEntry.rank * 2,
          icon: "Award",
          tierClass: "badge-muted",
          metricValue: `#${weeklyEntry.rank}`,
          periodLabel: "Weekly",
          active: true,
        });
      }
    }

    // Monthly Performer Badge (single highest earned for this cycle)
    if (monthlyEntry && monthlyEntry.conceptsCovered > 0 && Number.isFinite(monthlyEntry.rank) && monthlyEntry.rank >= 1) {
      if (monthlyEntry.rank === 1) {
        badges.push({
          id: "monthly-1",
          name: "Monthly Grandmaster",
          shortLabel: "#1 This Month",
          description: "Rank #1 highest sustained learning velocity across the past 30 days.",
          category: "monthly",
          level: 5,
          priorityWeight: 9300,
          icon: "Trophy",
          tierClass: "badge-gold",
          metricValue: "Rank #1",
          periodLabel: "Monthly",
          active: true,
        });
      } else if (monthlyEntry.rank <= 3) {
        badges.push({
          id: "monthly-podium",
          name: `Monthly Top 3 (#${monthlyEntry.rank})`,
          shortLabel: `Top 3 This Month`,
          description: `Rank #${monthlyEntry.rank} performer over the past 30 days.`,
          category: "monthly",
          level: 4,
          priorityWeight: 8300 - monthlyEntry.rank * 10,
          icon: "Medal",
          tierClass: "badge-silver",
          metricValue: `#${monthlyEntry.rank}`,
          periodLabel: "Monthly",
          active: true,
        });
      } else if (monthlyEntry.rank <= 10) {
        badges.push({
          id: "monthly-top-10",
          name: `Monthly Top 10 (#${monthlyEntry.rank})`,
          shortLabel: `Top 10 This Month`,
          description: `Rank #${monthlyEntry.rank} consistent learner this month.`,
          category: "monthly",
          level: 3,
          priorityWeight: 7300 - monthlyEntry.rank * 5,
          icon: "Award",
          tierClass: "badge-bronze",
          metricValue: `#${monthlyEntry.rank}`,
          periodLabel: "Monthly",
          active: true,
        });
      }
    }

    // Overall / All-Time Badge
    if (overallEntry && overallEntry.conceptsCovered > 0 && Number.isFinite(overallEntry.rank) && overallEntry.rank >= 1) {
      if (overallEntry.rank === 1) {
        badges.push({
          id: "overall-legend",
          name: "All-Time #1 Legend",
          shortLabel: "All-Time #1",
          description: "#1 overall learner on ConceptNichod.",
          category: "overall",
          level: 5,
          priorityWeight: 9600,
          icon: "Crown",
          tierClass: "badge-gold",
          metricValue: "Rank #1",
          periodLabel: "All-Time",
          active: true,
        });
      } else if (overallEntry.rank <= 3) {
        badges.push({
          id: "overall-podium",
          name: `All-Time Podium (#${overallEntry.rank})`,
          shortLabel: `All-Time #${overallEntry.rank}`,
          description: `Top 3 all-time concept mastery ranker.`,
          category: "overall",
          level: 4,
          priorityWeight: 8600 - overallEntry.rank * 10,
          icon: "Trophy",
          tierClass: "badge-silver",
          metricValue: `#${overallEntry.rank}`,
          periodLabel: "All-Time",
          active: true,
        });
      } else if (overallEntry.rank <= 10) {
        badges.push({
          id: "overall-top-10",
          name: `All-Time Top 10 (#${overallEntry.rank})`,
          shortLabel: `All-Time #${overallEntry.rank}`,
          description: `Top 10 all-time highest composite rank scores.`,
          category: "overall",
          level: 3,
          priorityWeight: 7600 - overallEntry.rank * 5,
          icon: "Award",
          tierClass: "badge-bronze",
          metricValue: `#${overallEntry.rank}`,
          periodLabel: "All-Time",
          active: true,
        });
      }
    }
  } else if (leaderboardResult.status === "rejected") {
    console.warn("Could not calculate leaderboard badges:", leaderboardResult.reason);
  }

  // 2. Active Daily Streak Badge (IST-aligned to match StudyStreak storage)
  if (streakResult.status === "fulfilled") {
    const streakDoc = streakResult.value;
    if (streakDoc) {
      const now = new Date();
      const todayStr = getIstDateString(now);
      const yesterdayStr = getYesterdayIstDateString(now);

      const isLive =
        typeof streakDoc.lastActiveDate === "string" &&
        (streakDoc.lastActiveDate >= todayStr || streakDoc.lastActiveDate === yesterdayStr);

      const currentStreak =
        isLive && Number.isFinite(streakDoc.currentStreak) && streakDoc.currentStreak > 0
          ? Math.floor(streakDoc.currentStreak)
          : 0;

      if (currentStreak >= 100) {
        badges.push({
          id: "streak-100",
          name: "100-Day Centurion",
          shortLabel: "100d Streak",
          description: "Unbroken 100-day daily study streak.",
          category: "streak",
          level: 4,
          priorityWeight: 8400,
          icon: "Flame",
          tierClass: "badge-flame",
          metricValue: `${currentStreak}d`,
          periodLabel: "Streak",
          active: true,
        });
      } else if (currentStreak >= 30) {
        badges.push({
          id: "streak-30",
          name: "30-Day Inferno",
          shortLabel: "30d Streak",
          description: "Continuous 30-day active learning streak.",
          category: "streak",
          level: 4,
          priorityWeight: 8000,
          icon: "Flame",
          tierClass: "badge-flame",
          metricValue: `${currentStreak}d`,
          periodLabel: "Streak",
          active: true,
        });
      } else if (currentStreak >= 14) {
        badges.push({
          id: "streak-14",
          name: "14-Day Blaze",
          shortLabel: "14d Streak",
          description: "Two consecutive weeks of daily concept practice.",
          category: "streak",
          level: 3,
          priorityWeight: 7000,
          icon: "Flame",
          tierClass: "badge-flame",
          metricValue: `${currentStreak}d`,
          periodLabel: "Streak",
          active: true,
        });
      } else if (currentStreak >= 7) {
        badges.push({
          id: "streak-7",
          name: "7-Day Spark",
          shortLabel: "7d Streak",
          description: "One full week of daily study momentum.",
          category: "streak",
          level: 2,
          priorityWeight: 6000,
          icon: "Flame",
          tierClass: "badge-flame",
          metricValue: `${currentStreak}d`,
          periodLabel: "Streak",
          active: true,
        });
      }
    }
  } else {
    console.warn("Could not calculate streak badges:", streakResult.reason);
  }

  // 3. Learning Velocity Badge
  if (topicsResult.status === "fulfilled") {
    const topics = topicsResult.value;
    const analyzed = topics.filter(
      (t) =>
        t.analysis &&
        typeof t.analysis.overallScore === "number" &&
        Number.isFinite(t.analysis.overallScore) &&
        t.analysis.overallScore >= 0 &&
        t.analysis.overallScore <= 100
    );

    if (analyzed.length >= 3) {
      analyzed.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      const N = analyzed.length;
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
      for (let i = 0; i < N; i++) {
        const x = i + 1;
        const y = analyzed[i].analysis.overallScore;
        sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x;
      }
      const num = N * sumXY - sumX * sumY;
      const den = N * sumX2 - sumX * sumX;
      const rawSlope = den !== 0 ? num / den : 0;
      const slope = Number.isFinite(rawSlope) ? Math.round(rawSlope * 100) / 100 : 0;

      if (slope >= 10.0) {
        badges.push({
          id: "velocity-10",
          name: "Hyper-Sonic Learner",
          shortLabel: "Slope +10",
          description: "Exceptional mastery acceleration with learning slope m ≥ +10.0.",
          category: "velocity",
          level: 3,
          priorityWeight: 7200,
          icon: "Zap",
          tierClass: "badge-emerald",
          metricValue: `m=+${slope}`,
          periodLabel: "Velocity",
          active: true,
        });
      } else if (slope >= 5.0) {
        badges.push({
          id: "velocity-5",
          name: "Fast Learner",
          shortLabel: "Slope +5",
          description: "Rapidly improving concept scores with positive slope m ≥ +5.0.",
          category: "velocity",
          level: 2,
          priorityWeight: 6200,
          icon: "Zap",
          tierClass: "badge-blue",
          metricValue: `m=+${slope}`,
          periodLabel: "Velocity",
          active: true,
        });
      }
    }
  } else {
    console.warn("Could not calculate velocity badges:", topicsResult.reason);
  }

  // 4. Concept Mirror Oral Defense Badge
  if (mirrorResult.status === "fulfilled") {
    const mirrorDocs = mirrorResult.value;
    if (mirrorDocs.length > 0) {
      let totalSec = 0;
      let scoreSum = 0;
      let validScoreCount = 0;

      for (const m of mirrorDocs) {
        if (typeof m.durationSeconds === "number" && Number.isFinite(m.durationSeconds) && m.durationSeconds > 0) {
          totalSec += m.durationSeconds;
        }
        if (typeof m.overallScore === "number" && Number.isFinite(m.overallScore) && m.overallScore >= 0 && m.overallScore <= 100) {
          scoreSum += m.overallScore;
          validScoreCount += 1;
        }
      }

      const avgScore = validScoreCount > 0 ? Math.round(scoreSum / validScoreCount) : 0;

      if (totalSec >= 1800 && avgScore >= 85) {
        badges.push({
          id: "mirror-socratic",
          name: "Socratic Grandmaster",
          shortLabel: "30m Defense",
          description: "Over 30 minutes of oral defense with ≥ 85% mastery score.",
          category: "defense",
          level: 4,
          priorityWeight: 8100,
          icon: "BrainCircuit",
          tierClass: "badge-purple",
          metricValue: `${Math.round(totalSec / 60)}m`,
          periodLabel: "Concept Mirror",
          active: true,
        });
      } else if (totalSec >= 600 && avgScore >= 75) {
        badges.push({
          id: "mirror-orator",
          name: "Articulate Orator",
          shortLabel: "10m Defense",
          description: "Defended complex concepts verbally for over 10 minutes.",
          category: "defense",
          level: 3,
          priorityWeight: 7100,
          icon: "BrainCircuit",
          tierClass: "badge-indigo",
          metricValue: `${Math.round(totalSec / 60)}m`,
          periodLabel: "Concept Mirror",
          active: true,
        });
      } else if (mirrorDocs.length >= 3) {
        badges.push({
          id: "mirror-defender",
          name: "Voice Defender",
          shortLabel: "3+ Defenses",
          description: "Completed 3 or more full Concept Mirror oral defenses.",
          category: "defense",
          level: 2,
          priorityWeight: 6100,
          icon: "BrainCircuit",
          tierClass: "badge-muted",
          metricValue: `${mirrorDocs.length} defenses`,
          periodLabel: "Concept Mirror",
          active: true,
        });
      }
    }
  } else {
    console.warn("Could not calculate oral defense badges:", mirrorResult.reason);
  }

  // Strict sorting: Highest level / priority first
  badges.sort((a, b) => b.priorityWeight - a.priorityWeight);

  const topBadge = badges.length > 0 ? badges[0] : null;

  return {
    badges,
    topBadge,
  };
}
