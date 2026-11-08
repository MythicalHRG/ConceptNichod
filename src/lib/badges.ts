import User from "@/models/User";
import ConceptMirror from "@/models/ConceptMirror";
import Topic from "@/models/Topic";
import StudyStreak from "@/models/StudyStreak";
import { getLeaderboardDataAction } from "@/app/actions/leaderboard";

export interface UserBadge {
  id: string;
  name: string;
  description: string;
  category: "distinction" | "weekly" | "monthly" | "overall" | "streak" | "velocity" | "defense";
  level: 1 | 2 | 3 | 4 | 5; // Level 5 is highest (Apex), Level 1 is lowest
  priorityWeight: number; // Higher number = better badge; used to pin best badge on top
  icon: "Crown" | "Trophy" | "Medal" | "Award" | "Flame" | "Zap" | "Sparkles" | "Target" | "BrainCircuit";
  colorScheme: {
    badgeBg: string;
    badgeBorder: string;
    badgeText: string;
    glowColor: string;
    tierLabel: string;
  };
  metricValue?: string;
  periodLabel: string;
  expiresAt?: string;
  active: boolean;
}

export async function computeUserBadges(userUuid: string, username: string): Promise<{
  badges: UserBadge[];
  topBadge: UserBadge | null;
}> {
  const cleanUsername = (username || "").trim().toLowerCase();
  const badges: UserBadge[] = [];

  const now = new Date();
  const nextWeekMidnight = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const nextMonthMidnight = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Distinction Badges (Owner & Bade Maalik - NO ADMIN)
  if (cleanUsername === "mythicalhrg") {
    badges.push({
      id: "platform-owner",
      name: "Platform Owner",
      description: "Visionary creator, lead developer & architect of Concepts Nichod.",
      category: "distinction",
      level: 5,
      priorityWeight: 10000,
      icon: "Crown",
      colorScheme: {
        badgeBg: "bg-gradient-to-r from-amber-500/20 via-yellow-500/20 to-amber-500/20",
        badgeBorder: "border-yellow-500/60 ring-2 ring-yellow-500/30",
        badgeText: "text-yellow-400",
        glowColor: "shadow-yellow-500/20",
        tierLabel: "Apex Distinction",
      },
      metricValue: "Founder",
      periodLabel: "Permanent Distinction",
      active: true,
    });
  } else if (["anurag", "rohit"].includes(cleanUsername)) {
    badges.push({
      id: "bade-maalik",
      name: "Bade Maalik",
      description: "Respected patron and institutional architect.",
      category: "distinction",
      level: 5,
      priorityWeight: 9800,
      icon: "Crown",
      colorScheme: {
        badgeBg: "bg-gradient-to-r from-purple-600/20 via-pink-500/20 to-amber-400/20",
        badgeBorder: "border-purple-500/60 ring-2 ring-purple-500/30",
        badgeText: "text-purple-300",
        glowColor: "shadow-purple-500/20",
        tierLabel: "Royal Distinction",
      },
      metricValue: "Bade Maalik",
      periodLabel: "Permanent Distinction",
      active: true,
    });
  }

  // 2. Fetch Leaderboard Standings for Weekly, Monthly, and Overall
  try {
    const [weeklyBoard, monthlyBoard, overallBoard] = await Promise.all([
      getLeaderboardDataAction("week", "All"),
      getLeaderboardDataAction("month", "All"),
      getLeaderboardDataAction("all", "All"),
    ]);

    const weeklyEntry = weeklyBoard.entries.find((e) => e.uuid === userUuid);
    const monthlyEntry = monthlyBoard.entries.find((e) => e.uuid === userUuid);
    const overallEntry = overallBoard.entries.find((e) => e.uuid === userUuid);

    // Weekly Performer Badges
    if (weeklyEntry && weeklyEntry.conceptsCovered > 0) {
      if (weeklyEntry.rank === 1) {
        badges.push({
          id: "weekly-rank-1",
          name: "Weekly #1 Champion",
          description: "Rank #1 performer this week based on learning velocity and concept mastery.",
          category: "weekly",
          level: 5,
          priorityWeight: 9500,
          icon: "Crown",
          colorScheme: {
            badgeBg: "bg-yellow-500/15",
            badgeBorder: "border-yellow-500/70 ring-1 ring-yellow-500/40",
            badgeText: "text-yellow-400",
            glowColor: "shadow-yellow-500/30",
            tierLabel: "Tier 1 Apex",
          },
          metricValue: "Rank #1 This Week",
          periodLabel: "Weekly Cycle",
          expiresAt: nextWeekMidnight,
          active: true,
        });
      } else if (weeklyEntry.rank <= 3) {
        badges.push({
          id: "weekly-podium",
          name: `Weekly Podium (#${weeklyEntry.rank})`,
          description: "Top 3 performer this week on the weekly learning velocity leaderboard.",
          category: "weekly",
          level: 4,
          priorityWeight: 8500 - weeklyEntry.rank * 10,
          icon: "Medal",
          colorScheme: {
            badgeBg: "bg-slate-400/15",
            badgeBorder: "border-slate-400/60 ring-1 ring-slate-400/30",
            badgeText: "text-slate-200",
            glowColor: "shadow-slate-400/20",
            tierLabel: "Tier 2 Elite",
          },
          metricValue: `Rank #${weeklyEntry.rank} This Week`,
          periodLabel: "Weekly Cycle",
          expiresAt: nextWeekMidnight,
          active: true,
        });
      } else if (weeklyEntry.rank <= 10) {
        badges.push({
          id: "weekly-top-10",
          name: `Weekly Top 10 (#${weeklyEntry.rank})`,
          description: "Top 10 performer maintaining high learning velocity this week.",
          category: "weekly",
          level: 3,
          priorityWeight: 7500 - weeklyEntry.rank * 5,
          icon: "Award",
          colorScheme: {
            badgeBg: "bg-emerald-500/15",
            badgeBorder: "border-emerald-500/60",
            badgeText: "text-emerald-400",
            glowColor: "shadow-emerald-500/20",
            tierLabel: "Tier 3 Vanguard",
          },
          metricValue: `Rank #${weeklyEntry.rank} This Week`,
          periodLabel: "Weekly Cycle",
          expiresAt: nextWeekMidnight,
          active: true,
        });
      } else if (weeklyEntry.rank <= 25) {
        badges.push({
          id: "weekly-top-25",
          name: `Weekly Top 25 (#${weeklyEntry.rank})`,
          description: "Ranked among top 25 active learners this week.",
          category: "weekly",
          level: 2,
          priorityWeight: 6500 - weeklyEntry.rank * 2,
          icon: "Target",
          colorScheme: {
            badgeBg: "bg-indigo-500/15",
            badgeBorder: "border-indigo-500/50",
            badgeText: "text-indigo-400",
            glowColor: "shadow-indigo-500/10",
            tierLabel: "Tier 4 Contender",
          },
          metricValue: `Rank #${weeklyEntry.rank} This Week`,
          periodLabel: "Weekly Cycle",
          expiresAt: nextWeekMidnight,
          active: true,
        });
      }
    }

    // Monthly Performer Badges
    if (monthlyEntry && monthlyEntry.conceptsCovered > 0) {
      if (monthlyEntry.rank === 1) {
        badges.push({
          id: "monthly-rank-1",
          name: "Monthly Grandmaster",
          description: "Rank #1 highest sustained learning velocity across the past 30 days.",
          category: "monthly",
          level: 5,
          priorityWeight: 9300,
          icon: "Trophy",
          colorScheme: {
            badgeBg: "bg-amber-500/15",
            badgeBorder: "border-amber-500/70 ring-1 ring-amber-500/40",
            badgeText: "text-amber-400",
            glowColor: "shadow-amber-500/25",
            tierLabel: "Tier 1 Apex",
          },
          metricValue: "Rank #1 This Month",
          periodLabel: "Monthly Cycle",
          expiresAt: nextMonthMidnight,
          active: true,
        });
      } else if (monthlyEntry.rank <= 3) {
        badges.push({
          id: "monthly-podium",
          name: `Monthly Podium (#${monthlyEntry.rank})`,
          description: "Top 3 sustained performer over the past 30 days.",
          category: "monthly",
          level: 4,
          priorityWeight: 8300 - monthlyEntry.rank * 10,
          icon: "Medal",
          colorScheme: {
            badgeBg: "bg-amber-600/15",
            badgeBorder: "border-amber-600/60",
            badgeText: "text-amber-300",
            glowColor: "shadow-amber-600/20",
            tierLabel: "Tier 2 Elite",
          },
          metricValue: `Rank #${monthlyEntry.rank} This Month`,
          periodLabel: "Monthly Cycle",
          expiresAt: nextMonthMidnight,
          active: true,
        });
      } else if (monthlyEntry.rank <= 10) {
        badges.push({
          id: "monthly-top-10",
          name: `Monthly Top 10 (#${monthlyEntry.rank})`,
          description: "Top 10 consistent aspirant over the monthly cycle.",
          category: "monthly",
          level: 3,
          priorityWeight: 7300 - monthlyEntry.rank * 5,
          icon: "Award",
          colorScheme: {
            badgeBg: "bg-cyan-500/15",
            badgeBorder: "border-cyan-500/60",
            badgeText: "text-cyan-400",
            glowColor: "shadow-cyan-500/20",
            tierLabel: "Tier 3 Vanguard",
          },
          metricValue: `Rank #${monthlyEntry.rank} This Month`,
          periodLabel: "Monthly Cycle",
          expiresAt: nextMonthMidnight,
          active: true,
        });
      }
    }

    // Overall / All-Time Badges
    if (overallEntry && overallEntry.conceptsCovered > 0) {
      if (overallEntry.rank === 1) {
        badges.push({
          id: "overall-legend-1",
          name: "All-Time Legend #1",
          description: "The #1 overall learner on Concepts Nichod platform history.",
          category: "overall",
          level: 5,
          priorityWeight: 9600,
          icon: "Crown",
          colorScheme: {
            badgeBg: "bg-gradient-to-r from-yellow-500/20 via-primary/20 to-amber-500/20",
            badgeBorder: "border-primary/80 ring-2 ring-primary/40",
            badgeText: "text-primary",
            glowColor: "shadow-primary/30",
            tierLabel: "All-Time #1",
          },
          metricValue: "Rank #1 All-Time",
          periodLabel: "All-Time Standing",
          active: true,
        });
      } else if (overallEntry.rank <= 3) {
        badges.push({
          id: "overall-podium",
          name: `All-Time Master (#${overallEntry.rank})`,
          description: "Top 3 all-time concept mastery ranker.",
          category: "overall",
          level: 4,
          priorityWeight: 8600 - overallEntry.rank * 10,
          icon: "Trophy",
          colorScheme: {
            badgeBg: "bg-yellow-500/10",
            badgeBorder: "border-yellow-500/50",
            badgeText: "text-yellow-400",
            glowColor: "shadow-yellow-500/20",
            tierLabel: "All-Time Master",
          },
          metricValue: `Rank #${overallEntry.rank} All-Time`,
          periodLabel: "All-Time Standing",
          active: true,
        });
      } else if (overallEntry.rank <= 10) {
        badges.push({
          id: "overall-top-10",
          name: `All-Time Diamond (#${overallEntry.rank})`,
          description: "Top 10 all-time highest composite rank scores.",
          category: "overall",
          level: 3,
          priorityWeight: 7600 - overallEntry.rank * 5,
          icon: "Award",
          colorScheme: {
            badgeBg: "bg-violet-500/15",
            badgeBorder: "border-violet-500/50",
            badgeText: "text-violet-400",
            glowColor: "shadow-violet-500/20",
            tierLabel: "All-Time Diamond",
          },
          metricValue: `Rank #${overallEntry.rank} All-Time`,
          periodLabel: "All-Time Standing",
          active: true,
        });
      }
    }
  } catch (err) {
    console.warn("Could not calculate leaderboard badges:", err);
  }

  // 3. Consistency & Streak Badges (Using strictly server timestamps)
  try {
    const streakDoc = await StudyStreak.findOne({ userId: userUuid }).lean();
    if (streakDoc) {
      const todayStr = now.toISOString().slice(0, 10);
      const yesterdayStr = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      // Verify streak is active today or yesterday
      const isStreakActive =
        streakDoc.lastActiveDate === todayStr ||
        streakDoc.lastActiveDate === yesterdayStr;

      const currentStreak = isStreakActive ? streakDoc.currentStreak : 0;

      if (currentStreak >= 100) {
        badges.push({
          id: "streak-centurion",
          name: "100-Day Centurion",
          description: "Achieved an unbroken 100-day daily study streak.",
          category: "streak",
          level: 4,
          priorityWeight: 8400,
          icon: "Flame",
          colorScheme: {
            badgeBg: "bg-red-500/15",
            badgeBorder: "border-red-500/70 ring-1 ring-red-500/40",
            badgeText: "text-red-400",
            glowColor: "shadow-red-500/25",
            tierLabel: "Tier 2 Elite",
          },
          metricValue: `${currentStreak}d Active Streak`,
          periodLabel: "Daily Consistency",
          active: true,
        });
      } else if (currentStreak >= 30) {
        badges.push({
          id: "streak-inferno",
          name: "30-Day Inferno",
          description: "Maintained a continuous 30-day active learning streak.",
          category: "streak",
          level: 4,
          priorityWeight: 8000,
          icon: "Flame",
          colorScheme: {
            badgeBg: "bg-orange-500/15",
            badgeBorder: "border-orange-500/60",
            badgeText: "text-orange-400",
            glowColor: "shadow-orange-500/20",
            tierLabel: "Tier 2 Elite",
          },
          metricValue: `${currentStreak}d Active Streak`,
          periodLabel: "Daily Consistency",
          active: true,
        });
      } else if (currentStreak >= 14) {
        badges.push({
          id: "streak-blaze",
          name: "14-Day Blaze",
          description: "Two consecutive weeks of daily concept practice.",
          category: "streak",
          level: 3,
          priorityWeight: 7000,
          icon: "Flame",
          colorScheme: {
            badgeBg: "bg-amber-500/15",
            badgeBorder: "border-amber-500/60",
            badgeText: "text-amber-400",
            glowColor: "shadow-amber-500/15",
            tierLabel: "Tier 3 Vanguard",
          },
          metricValue: `${currentStreak}d Active Streak`,
          periodLabel: "Daily Consistency",
          active: true,
        });
      } else if (currentStreak >= 7) {
        badges.push({
          id: "streak-spark",
          name: "7-Day Spark",
          description: "One full week of unbroken daily study momentum.",
          category: "streak",
          level: 2,
          priorityWeight: 6000,
          icon: "Flame",
          colorScheme: {
            badgeBg: "bg-yellow-500/15",
            badgeBorder: "border-yellow-500/50",
            badgeText: "text-yellow-400",
            glowColor: "shadow-yellow-500/10",
            tierLabel: "Tier 4 Contender",
          },
          metricValue: `${currentStreak}d Active Streak`,
          periodLabel: "Daily Consistency",
          active: true,
        });
      }
    }
  } catch (err) {
    console.warn("Could not calculate streak badges:", err);
  }

  // 4. Learning Velocity & Slope Badges
  try {
    const topics = await Topic.find({ userId: userUuid }).lean();
    const analyzed = topics.filter(
      (t) => t.analysis && typeof t.analysis.overallScore === "number"
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
      const slope = den !== 0 ? Math.round((num / den) * 100) / 100 : 0;

      if (slope >= 10.0) {
        badges.push({
          id: "velocity-hypersonic",
          name: "Hyper-Sonic Learner",
          description: "Exceptional mastery acceleration with a learning slope m ≥ +10.0.",
          category: "velocity",
          level: 3,
          priorityWeight: 7200,
          icon: "Zap",
          colorScheme: {
            badgeBg: "bg-emerald-500/15",
            badgeBorder: "border-emerald-500/60 ring-1 ring-emerald-500/30",
            badgeText: "text-emerald-400",
            glowColor: "shadow-emerald-500/20",
            tierLabel: "Tier 3 Vanguard",
          },
          metricValue: `Slope +${slope}`,
          periodLabel: "Growth Acceleration",
          active: true,
        });
      } else if (slope >= 5.0) {
        badges.push({
          id: "velocity-accelerated",
          name: "Accelerated Mastery",
          description: "Rapidly improving concept scores with a positive slope m ≥ +5.0.",
          category: "velocity",
          level: 2,
          priorityWeight: 6200,
          icon: "Zap",
          colorScheme: {
            badgeBg: "bg-blue-500/15",
            badgeBorder: "border-blue-500/50",
            badgeText: "text-blue-400",
            glowColor: "shadow-blue-500/15",
            tierLabel: "Tier 4 Contender",
          },
          metricValue: `Slope +${slope}`,
          periodLabel: "Growth Acceleration",
          active: true,
        });
      }
    }
  } catch (err) {
    console.warn("Could not calculate velocity badges:", err);
  }

  // 5. Concept Mirror Oral Defense Badges
  try {
    const mirrorDocs = await ConceptMirror.find({ userId: userUuid }).lean();
    if (mirrorDocs.length > 0) {
      const totalSec = mirrorDocs.reduce((acc, m) => acc + (m.durationSeconds || 0), 0);
      const avgScore =
        Math.round(
          mirrorDocs.reduce((acc, m) => acc + (m.overallScore || 0), 0) /
            mirrorDocs.length
        );

      if (totalSec >= 1800 && avgScore >= 85) {
        badges.push({
          id: "mirror-socratic-grandmaster",
          name: "Socratic Grandmaster",
          description: "Completed over 30 minutes of oral defense with ≥ 85% mastery score.",
          category: "defense",
          level: 4,
          priorityWeight: 8100,
          icon: "BrainCircuit",
          colorScheme: {
            badgeBg: "bg-purple-500/15",
            badgeBorder: "border-purple-500/60 ring-1 ring-purple-500/30",
            badgeText: "text-purple-300",
            glowColor: "shadow-purple-500/20",
            tierLabel: "Tier 2 Elite",
          },
          metricValue: `${Math.round(totalSec / 60)}m Defended (${avgScore}%)`,
          periodLabel: "Concept Mirror",
          active: true,
        });
      } else if (totalSec >= 600 && avgScore >= 75) {
        badges.push({
          id: "mirror-articulate-orator",
          name: "Articulate Orator",
          description: "Defended complex concepts verbally for over 10 minutes.",
          category: "defense",
          level: 3,
          priorityWeight: 7100,
          icon: "BrainCircuit",
          colorScheme: {
            badgeBg: "bg-indigo-500/15",
            badgeBorder: "border-indigo-500/50",
            badgeText: "text-indigo-300",
            glowColor: "shadow-indigo-500/15",
            tierLabel: "Tier 3 Vanguard",
          },
          metricValue: `${Math.round(totalSec / 60)}m Defended`,
          periodLabel: "Concept Mirror",
          active: true,
        });
      } else if (mirrorDocs.length >= 3) {
        badges.push({
          id: "mirror-voice-defender",
          name: "Voice Defender",
          description: "Completed 3 or more full Concept Mirror oral defenses.",
          category: "defense",
          level: 2,
          priorityWeight: 6100,
          icon: "BrainCircuit",
          colorScheme: {
            badgeBg: "bg-muted/70",
            badgeBorder: "border-border",
            badgeText: "text-foreground",
            glowColor: "shadow-sm",
            tierLabel: "Tier 4 Contender",
          },
          metricValue: `${mirrorDocs.length} Oral Defenses`,
          periodLabel: "Concept Mirror",
          active: true,
        });
      }
    }
  } catch (err) {
    console.warn("Could not calculate oral defense badges:", err);
  }

  // 6. Strict Hierarchical Sorting: Highest level / weight ALWAYS first (on top)
  badges.sort((a, b) => b.priorityWeight - a.priorityWeight);

  const topBadge = badges.length > 0 ? badges[0] : null;

  return {
    badges,
    topBadge,
  };
}
