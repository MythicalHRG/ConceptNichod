# STRICT EXECUTION CONTRACT — BATCH 2 FIXES (ConceptNichod)

**Repository:** `MythicalHRG/ConceptNichod`  
**Target Branch:** `main` (commit directly to `main` as ordered by repository owner)

## ZERO-IMPROVISATION RULES (NON-NEGOTIABLE)
1. **APPLY ONLY THE EXACT 19 FILES BELOW.** Do NOT invent extra refactors, do NOT touch any file not listed below, and do NOT modify any test files during this step.
2. **VERBATIM REPLACEMENT:** Write the complete, exact contents below for every single one of the 19 files onto `main`.
3. **COMMIT MESSAGE:** Use a single commit (or cleanly grouped commits on `main`) titled:
   `fix(batch2): close email Server Action relay, fix IST streak badges & streak races, harden models and donation validation`
4. **MANDATORY POST-COMMIT CI CHECK:** Immediately after committing all 19 files to `main`, check the GitHub Actions `CI` workflow run triggered by the final commit on `main` and report:
   - `COMMIT_SHAS`: exact commit SHA(s) pushed to `main`
   - `UPDATED_FILES_COUNT`: `X/19` (list any skipped/failed file if `< 19`)
   - `CI_RUN_ID` & `CI_RUN_STATUS`: workflow run ID, current status, and exact failing step/error lines if failed

---

## EXACT REPLACEMENT FILES (19 FILES)

### FILE 1: `src/services/email.ts`
```ts
import 'server-only';
import { createTransport, type Transporter } from 'nodemailer';

let cachedTransporter: Transporter | null = null;
let cachedCredKey: string | null = null;

function getTransporter(): { transporter: Transporter; user: string } {
  const user = process.env.EMAIL_SERVER_USER?.trim();
  const pass = process.env.EMAIL_SERVER_PASSWORD;
  if (!user || !pass) {
    throw new Error(
      'Missing EMAIL_SERVER_USER or EMAIL_SERVER_PASSWORD environment variables.'
    );
  }

  const credKey = `${user}\0${pass}`;
  if (!cachedTransporter || cachedCredKey !== credKey) {
    cachedTransporter = createTransport({
      service: 'gmail',
      auth: { user, pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    cachedCredKey = credKey;
  }

  return { transporter: cachedTransporter, user };
}

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const cleanTo = typeof to === 'string' ? to.trim() : '';
  const cleanSubject = typeof subject === 'string' ? subject.trim() : '';
  if (!cleanTo || /[\r\n\0]/.test(cleanTo) || !cleanTo.includes('@')) {
    throw new Error('Invalid email recipient.');
  }
  if (!cleanSubject || /[\r\n\0]/.test(cleanSubject)) {
    throw new Error('Invalid email subject.');
  }
  if (typeof html !== 'string' || !html.trim()) {
    throw new Error('Email HTML body is required.');
  }

  const { transporter, user } = getTransporter();

  const mailOptions = {
    from: user,
    to: cleanTo,
    subject: cleanSubject,
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return info;
  } catch (error) {
    console.error('Failed to send email via SMTP:', error instanceof Error ? error.message : 'Unknown error');
    throw new Error('Could not send email.');
  }
}
```

### FILE 2: `src/lib/badges.ts`
```ts
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
```

### FILE 3: `src/lib/streak.ts`
```ts
import dbConnect from "@/lib/mongoose";
import StudyStreak from "@/models/StudyStreak";

const IST_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Returns date in YYYY-MM-DD format strictly in Indian Standard Time (Asia/Kolkata).
 * Ensures students studying past midnight (00:00 - 05:30 IST) are credited with the correct Indian calendar day.
 */
export function getIstDateString(date: Date = new Date()): string {
  return IST_DATE_FORMATTER.format(date);
}

export function getYesterdayIstDateString(date: Date = new Date()): string {
  const prev = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  return getIstDateString(prev);
}

/**
 * Atomically updates a user's study streak using server-side IST timestamps.
 */
export async function recordUserStudyActivity(userId: string): Promise<{
  currentStreak: number;
  longestStreak: number;
}> {
  const cleanUserId = typeof userId === "string" ? userId.trim() : "";
  if (!cleanUserId) return { currentStreak: 0, longestStreak: 0 };
  await dbConnect();

  const now = new Date();
  const todayStr = getIstDateString(now);
  const yesterdayStr = getYesterdayIstDateString(now);

  for (let attempt = 0; attempt < 2; attempt++) {
    const existing = await StudyStreak.findOne({ userId: cleanUserId }).lean();

    if (!existing) {
      try {
        await StudyStreak.create({
          userId: cleanUserId,
          currentStreak: 1,
          longestStreak: 1,
          lastActiveDate: todayStr,
          activityDates: [todayStr],
          updatedAt: now,
        });
        return { currentStreak: 1, longestStreak: 1 };
      } catch (err: any) {
        if (err?.code === 11000) continue;
        throw err;
      }
    }

    if (typeof existing.lastActiveDate === "string" && existing.lastActiveDate >= todayStr) {
      return {
        currentStreak: existing.currentStreak,
        longestStreak: existing.longestStreak,
      };
    }

    const baseStreak = Number.isFinite(existing.currentStreak) && existing.currentStreak > 0
      ? Math.floor(existing.currentStreak)
      : 0;
    const baseLongest = Number.isFinite(existing.longestStreak) && existing.longestStreak > 0
      ? Math.floor(existing.longestStreak)
      : 0;

    const nextCurrent = existing.lastActiveDate === yesterdayStr ? baseStreak + 1 : 1;
    const nextLongest = Math.max(baseLongest, nextCurrent);

    const updated = await StudyStreak.findOneAndUpdate(
      { userId: cleanUserId, lastActiveDate: existing.lastActiveDate },
      {
        $set: {
          currentStreak: nextCurrent,
          longestStreak: nextLongest,
          lastActiveDate: todayStr,
          updatedAt: now,
        },
        $addToSet: { activityDates: todayStr },
      },
      { new: true }
    ).lean();

    if (updated) {
      return {
        currentStreak: updated.currentStreak,
        longestStreak: updated.longestStreak,
      };
    }
  }

  const latest = await StudyStreak.findOne({ userId: cleanUserId }).lean();
  return {
    currentStreak: latest?.currentStreak ?? 0,
    longestStreak: latest?.longestStreak ?? 0,
  };
}

export async function getUserStreak(userId: string): Promise<{
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string;
}> {
  const cleanUserId = typeof userId === "string" ? userId.trim() : "";
  if (!cleanUserId) return { currentStreak: 0, longestStreak: 0, lastActiveDate: "" };
  await dbConnect();

  const streakDoc = await StudyStreak.findOne({ userId: cleanUserId }).lean();
  if (!streakDoc) return { currentStreak: 0, longestStreak: 0, lastActiveDate: "" };

  const now = new Date();
  const todayStr = getIstDateString(now);
  const yesterdayStr = getYesterdayIstDateString(now);

  // If last activity is older than yesterday in IST, the active streak is currently broken (0)
  const isStreakLive =
    typeof streakDoc.lastActiveDate === "string" &&
    (streakDoc.lastActiveDate >= todayStr || streakDoc.lastActiveDate === yesterdayStr);

  return {
    currentStreak: isStreakLive ? streakDoc.currentStreak : 0,
    longestStreak: streakDoc.longestStreak,
    lastActiveDate: streakDoc.lastActiveDate,
  };
}
```

### FILE 4: `src/lib/donation-validation.ts`
```ts
export type PatronTier = "LEGEND" | "DIAMOND" | "GOLD" | "SILVER" | "SUPPORTER" | "Legend" | "Benefactor" | "Patron" | "Supporter";

export interface DonationSubmissionInput {
  donorName: string; utr: string; transactionId: string; message?: string; isAnonymous?: boolean;
}
export interface ValidationResult<T> { valid: boolean; data?: T; error?: string; }

export function sanitizeDonationText(input: unknown, maxLength = 250): string {
  if (typeof input !== "string") return "";
  const safeMax = Number.isFinite(maxLength) ? Math.max(0, Math.floor(maxLength)) : 250;
  let cleaned = input.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
  let prev: string;
  do {
    prev = cleaned;
    cleaned = cleaned.replace(/<[^<>]*>/g, "");
  } while (cleaned !== prev);
  cleaned = cleaned.replace(/[<>]/g, "");
  return cleaned.trim().slice(0, safeMax);
}
export function validateUtr(rawUtr: unknown): ValidationResult<string> {
  if (typeof rawUtr !== "string") return { valid: false, error: "UTR number is required." };
  const normalized = rawUtr.replace(/\s+/g, "").trim();
  if (!/^\d{12}$/.test(normalized) || /^(\d)\1{11}$/.test(normalized)) return { valid: false, error: "UTR must be a genuine exact 12-digit numeric reference." };
  return { valid: true, data: normalized };
}
export function validateTransactionId(raw: unknown): ValidationResult<string> {
  if (typeof raw !== "string") return { valid: false, error: "Transaction ID is required." };
  const normalized = raw.replace(/\s+/g, "").trim().toUpperCase();
  if (!/^[A-Z0-9_-]{6,45}$/.test(normalized)) return { valid: false, error: "Transaction ID must be 6–45 alphanumeric characters." };
  return { valid: true, data: normalized };
}
export function validateDonationSubmission(payload: Record<string, unknown>): ValidationResult<DonationSubmissionInput> {
  if (!payload || typeof payload !== "object") return { valid: false, error: "Invalid donation submission payload." };
  const donorName = sanitizeDonationText(payload.donorName, 60).replace(/\s+/g, " ");
  if (donorName.length < 2) return { valid: false, error: "Please enter your name (at least 2 characters)." };
  const utr = validateUtr(payload.utr); if (!utr.valid || !utr.data) return { valid: false, error: utr.error };
  const transactionId = validateTransactionId(payload.transactionId); if (!transactionId.valid || !transactionId.data) return { valid: false, error: transactionId.error };
  return { valid: true, data: { donorName, utr: utr.data, transactionId: transactionId.data, message: sanitizeDonationText(payload.message, 250), isAnonymous: payload.isAnonymous === true } };
}
export function validateAdminVerifiedAmount(raw: unknown): ValidationResult<number> {
  let amount: number;
  if (typeof raw === "number") {
    amount = raw;
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return { valid: false, error: "Enter a verified amount between ₹1 and ₹1,00,00,000." };
    amount = Number(trimmed);
  } else {
    return { valid: false, error: "Enter a verified amount between ₹1 and ₹1,00,00,000." };
  }
  if (!Number.isFinite(amount) || amount < 1 || amount > 10000000) return { valid: false, error: "Enter a verified amount between ₹1 and ₹1,00,00,000." };
  return { valid: true, data: Math.round(amount * 100) / 100 };
}
export function computePatronTier(amount: number): PatronTier {
  if (!Number.isFinite(amount) || amount < 1) return "SUPPORTER";
  if (amount >= 5000) return "LEGEND"; if (amount >= 2000) return "DIAMOND"; if (amount >= 500) return "GOLD"; if (amount >= 100) return "SILVER"; return "SUPPORTER";
}
// Backward-compatible helper exports used by existing ConceptNichod modules and tests.
export function sanitizePlainText(value: unknown, maxLength: number): string { return sanitizeDonationText(typeof value === "string" ? value : String(value ?? ""), maxLength); }
export function normalizeDonorName(value: unknown): string | null { const v=sanitizeDonationText(value,60).replace(/\s+/g," "); return v.length>=2?v:null; }
export function normalizeUtr(value: unknown): string | null { const r=validateUtr(value); return r.valid?r.data??null:null; }
export function normalizeTransactionId(value: unknown): string | null { const r=validateTransactionId(value); return r.valid?r.data??null:null; }
export function normalizeDonationMessage(value: unknown): string { return sanitizeDonationText(value,250); }
export function parseVerifiedAmount(value: unknown): number | null { const r=validateAdminVerifiedAmount(value); return r.valid?r.data??null:null; }
export function parseDonationAmount(value: unknown): number | null { return parseVerifiedAmount(value); }
export function normalizeUpiReference(value: unknown): string | null { return normalizeUtr(value); }
export function normalizeVpa(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v.includes("..")) return null;
  return /^[a-z0-9][a-z0-9._-]{0,254}[a-z0-9]@[a-z0-9][a-z0-9.-]{0,62}[a-z0-9]$/.test(v) ? v : null;
}
export function isExactDonationMatch(a:number,b:number,c:string,d:string):boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b) || typeof c !== "string" || typeof d !== "string") return false;
  const normC = c.trim().toLowerCase();
  const normD = d.trim().toLowerCase();
  if (!normC || !normD) return false;
  return Math.round(a*100)===Math.round(b*100) && normC===normD;
}
```

### FILE 5: `src/lib/donation-donor-sync.js`
```js
import { createHash } from "node:crypto";

/**
 * Idempotently synchronizes one verified donation to its transaction-scoped
 * Donor row. The adapter owns the database operations; this state machine
 * owns the deterministic identity and duplicate-key recovery behavior.
 */
export async function syncDonationDonor({ tx, donorData, donorStore }) {
  if (!tx || tx._id == null || String(tx._id).trim() === "") {
    throw new Error("Donation transaction ID is required for donor synchronization.");
  }
  const transactionRef = String(tx._id).trim();
  const existingDonor = tx.donorRecordId
    ? null
    : await donorStore.findOneByTransactionRef(transactionRef);
  const donorUuid =
    existingDonor?.uuid ||
    createHash("sha256").update(`conceptnichod:donation:${transactionRef}`).digest("hex");

  let donor;
  if (tx.donorRecordId) {
    donor = await donorStore.updateById(String(tx.donorRecordId), donorData);
  } else {
    try {
      donor = await donorStore.upsertByUuid(donorUuid, donorData);
    } catch (donorError) {
      if (donorError?.code !== 11000) throw donorError;
      donor = await donorStore.updateByUuid(donorUuid, donorData);
    }
  }

  if (!donor) {
    throw new Error("Donor record could not be confirmed; retry patron synchronization.");
  }

  tx.donorRecordId = String(donor._id);
  return donor;
}
```

### FILE 6: `src/lib/types.ts`
```ts
import type { FinalAnalysisOutput } from "@/ai/flows/analyze-answers";

export type Topic = {
  id: string;
  userId: string;
  name: string;
  classLevel: string;
  subject: string;
  chapter: string;
  examFocus?: string;
  summary?: string;
  questions?: Question[];
  analysis?: FinalAnalysisOutput;
  practiceStatus?: 'not_started' | 'in_progress' | 'completed';
  summaryViewed?: boolean;
  savedWrittenAnswers?: string[];
  savedSpokenAnswers?: string[];
  createdAt: Date;
};

export type Question = {
  type: string;
  question: string;
};
```

### FILE 7: `src/models/Blacklist.ts`
```ts
import mongoose, { Schema, Document, Model } from "mongoose";

export interface IBlacklist extends Document {
  type: "ip" | "email" | "username";
  value: string;
  reason?: string;
  createdAt: Date;
}

const BlacklistSchema: Schema<IBlacklist> = new Schema({
  type: { type: String, enum: ["ip", "email", "username"], required: true },
  value: { type: String, required: true, trim: true, lowercase: true },
  reason: { type: String, required: false, trim: true, maxlength: 500 },
  createdAt: { type: Date, default: Date.now }
});

// Ensure a combination of type and value is unique to prevent duplicate bans
BlacklistSchema.index({ type: 1, value: 1 }, { unique: true });

const Blacklist: Model<IBlacklist> = mongoose.models.Blacklist || mongoose.model<IBlacklist>("Blacklist", BlacklistSchema);

export default Blacklist;
```

### FILE 8: `src/models/DonationTransaction.ts`
```ts
import mongoose, { Schema, Document, Model } from "mongoose";
import { randomUUID } from "crypto";
import { PatronTier, computePatronTier } from "@/lib/donation-validation";

export type DonationTransactionStatus = "pending" | "verified" | "rejected";

export interface IDonationTransaction extends Document {
  uuid: string;
  userId?: string | null;
  userUuid?: string | null;
  username?: string | null;
  donorName: string;
  donorEmail?: string | null;
  isAnonymous: boolean;
  utr: string;
  transactionId?: string | null;
  message?: string;
  claimedAmount?: number | null;
  amount?: number | null;
  status: DonationTransactionStatus;
  verifiedAmount: number | null;
  patronTier: PatronTier | null;
  isPublishedToPatrons: boolean;
  donorRecordId?: string | null;
  bankReference?: string | null;
  recipientVpa?: string | null;
  verificationMethod?: "manual-bank-reconciliation" | null;
  adminNote?: string;
  verifiedBy?: string | null;
  verifiedAt?: Date | null;
  submitterIp?: string;
  isPublic: boolean;
  donatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const isNullableFiniteCurrency = (v: number | null | undefined) =>
  v == null || (Number.isFinite(v) && v >= 0 && v <= 10_000_000);

const isNullableVerifiedCurrency = (v: number | null | undefined) =>
  v == null || (Number.isFinite(v) && v >= 1 && v <= 10_000_000);

const DonationTransactionSchema = new Schema<IDonationTransaction>({
  uuid: { type: String, required: true, unique: true, default: () => randomUUID() },
  // Both IDs remain strings: ConceptNichod uses UUID strings, not Mongo ObjectIds.
  userId: { type: String, default: null, index: true },
  userUuid: { type: String, default: null, index: true },
  username: { type: String, trim: true, default: null },
  donorName: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
  donorEmail: { type: String, trim: true, lowercase: true, default: null },
  isAnonymous: { type: Boolean, default: false },
  utr: { type: String, required: true, unique: true, trim: true, match: [/^\d{12}$/, "UTR must be an exact 12-digit number"] },
  // Sparse unique index allows legacy rows without a Transaction ID.
  transactionId: { type: String, required: function (this: any) { return this.isNew; }, unique: true, sparse: true, trim: true, uppercase: true, minlength: 6, maxlength: 45, match: /^[A-Z0-9_-]{6,45}$/ },
  message: { type: String, trim: true, maxlength: 250, default: "" },
  claimedAmount: { type: Number, default: null, min: 0, validate: { validator: isNullableFiniteCurrency, message: "Claimed amount must be a finite valid number" } },
  amount: { type: Number, default: null, min: 0, validate: { validator: isNullableFiniteCurrency, message: "Amount must be a finite valid number" } },
  status: { type: String, enum: ["pending", "verified", "rejected"], default: "pending", index: true },
  verifiedAmount: { type: Number, default: null, min: 1, validate: { validator: isNullableVerifiedCurrency, message: "Verified amount must be a finite valid number" } },
  patronTier: { type: String, enum: ["LEGEND", "DIAMOND", "GOLD", "SILVER", "SUPPORTER", "Legend", "Benefactor", "Patron", "Supporter", null], default: null },
  isPublishedToPatrons: { type: Boolean, default: false, index: true },
  donorRecordId: { type: String, default: null },
  bankReference: { type: String, trim: true, default: null },
  recipientVpa: { type: String, trim: true, lowercase: true, default: null },
  verificationMethod: { type: String, enum: ["manual-bank-reconciliation", null], default: null },
  adminNote: { type: String, trim: true, maxlength: 500, default: "" },
  verifiedBy: { type: String, default: null },
  verifiedAt: { type: Date, default: null },
  submitterIp: { type: String, select: false },
  // Legacy fields retained for older history queries.
  isPublic: { type: Boolean, default: false },
  donatedAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

DonationTransactionSchema.index({ status: 1, createdAt: -1 });
DonationTransactionSchema.index({ status: 1, isPublishedToPatrons: 1, verifiedAmount: -1 });
DonationTransactionSchema.index({ userId: 1, createdAt: -1 });

DonationTransactionSchema.pre("save", function (this: IDonationTransaction) {
  if (this.status !== "verified" || !this.verifiedAmount || !Number.isFinite(this.verifiedAmount) || this.verifiedAmount <= 0) {
    this.isPublishedToPatrons = false;
    this.isPublic = false;
    this.patronTier = null;
  } else {
    this.amount = this.verifiedAmount;
    this.isPublic = Boolean(this.isPublishedToPatrons);
    if (!this.patronTier) this.patronTier = computePatronTier(this.verifiedAmount);
  }
});

export const DonationTransaction: Model<IDonationTransaction> =
  mongoose.models.DonationTransaction ||
  mongoose.model<IDonationTransaction>("DonationTransaction", DonationTransactionSchema);
export default DonationTransaction;
```

### FILE 9: `src/models/DonationSetting.ts`
```ts
import mongoose, { Schema, Document, Model } from "mongoose";

export interface IDonationSetting extends Document {
  upiId: string;
  payeeName: string;
  qrCodeUrl: string;
  isEnabled: boolean;
  headline: string;
  subtext: string;
  customInstructions: string;
  thankYouNote: string;
  updatedBy?: string;
  updatedAt: Date;
}

const DonationSettingSchema = new Schema<IDonationSetting>({
  upiId: { type: String, trim: true, lowercase: true, default: "" },
  payeeName: { type: String, required: true, trim: true, default: process.env.NEXT_PUBLIC_UPI_NAME || "ConceptNichod" },
  qrCodeUrl: { type: String, trim: true, default: "" },
  isEnabled: { type: Boolean, default: false },
  headline: { type: String, trim: true, default: "Support ConceptNichod & Join the Hall of Patrons" },
  subtext: { type: String, trim: true, default: "Scan the UPI QR code to donate any amount, then submit your 12-digit UTR and Transaction ID below for manual Admin verification." },
  // Legacy settings retained so older admin settings screens remain compatible.
  customInstructions: { type: String, default: "Pay using any UPI app, then submit your transaction reference for manual verification." },
  thankYouNote: { type: String, default: "Thank you for supporting ConceptNichod." },
  updatedBy: { type: String, default: null },
}, { timestamps: true });

export const DonationSetting: Model<IDonationSetting> =
  mongoose.models.DonationSetting ||
  mongoose.model<IDonationSetting>("DonationSetting", DonationSettingSchema);
export default DonationSetting;
```

### FILE 10: `src/models/Donor.ts`
```ts
import mongoose, { Schema, Document, Model } from "mongoose";
import { randomUUID } from "crypto";
import { PatronTier } from "@/lib/donation-validation";

export interface IDonor extends Document {
  uuid: string;
  userId?: string | null;
  userUuid?: string | null;
  username?: string | null;
  name: string;
  amount: number;
  totalAmount?: number;
  donationCount?: number;
  tier: PatronTier;
  message?: string;
  latestMessage?: string;
  isAnonymous: boolean;
  isVisible: boolean;
  isPublic: boolean;
  utr?: string;
  transactionId?: string | null;
  transactionRef?: string | null;
  verifiedBy?: string | null;
  donatedAt: Date;
  lastDonatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const isFinitePositiveAmount = (v: number) =>
  Number.isFinite(v) && v >= 1 && v <= 10_000_000;

const isFiniteNonNegativeAmount = (v: number | null | undefined) =>
  v == null || (Number.isFinite(v) && v >= 0 && v <= 100_000_000);

const isNonNegativeSafeInt = (v: number | null | undefined) =>
  v == null || (Number.isSafeInteger(v) && v >= 0);

const DonorSchema = new Schema<IDonor>({
  uuid: { type: String, required: true, unique: true, default: () => randomUUID() },
  userId: { type: String, default: null, index: true },
  userUuid: { type: String, default: null, index: true },
  username: { type: String, trim: true, default: null },
  name: { type: String, required: function (this: any) { return this.isNew; }, trim: true, maxlength: 60 },
  amount: { type: Number, required: true, min: [1, "Verified patron amount must be at least ₹1"], validate: { validator: isFinitePositiveAmount, message: "Verified patron amount must be finite" } },
  // Old title-case tiers remain accepted for legacy records.
  tier: { type: String, enum: ["LEGEND", "DIAMOND", "GOLD", "SILVER", "SUPPORTER", "Legend", "Benefactor", "Patron", "Supporter"], default: "SUPPORTER" },
  message: { type: String, trim: true, maxlength: 250, default: "" },
  latestMessage: { type: String, trim: true, maxlength: 250, default: "" },
  isAnonymous: { type: Boolean, default: false },
  isVisible: { type: Boolean, default: true, index: true },
  isPublic: { type: Boolean, default: true, index: true },
  utr: { type: String, trim: true, select: false },
  transactionId: { type: String, trim: true, select: false },
  transactionRef: { type: String, default: null, index: true },
  verifiedBy: { type: String, default: null },
  totalAmount: { type: Number, default: 0, min: 0, validate: { validator: isFiniteNonNegativeAmount, message: "Total amount must be finite" } },
  donationCount: { type: Number, default: 1, min: 0, validate: { validator: isNonNegativeSafeInt, message: "Donation count must be a non-negative integer" } },
  donatedAt: { type: Date, default: Date.now },
  lastDonatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

DonorSchema.index({ isVisible: 1, amount: -1, donatedAt: -1 });
DonorSchema.index({ isPublic: 1, totalAmount: -1, lastDonatedAt: -1 });

export const Donor: Model<IDonor> =
  mongoose.models.Donor || mongoose.model<IDonor>("Donor", DonorSchema);
export default Donor;
```

### FILE 11: `src/models/ConceptMirror.ts`
```ts
import mongoose, { Schema, Document, Model } from "mongoose";

export interface IConceptMirror extends Document {
  userId: string;
  conceptName: string;
  transcript: string;
  durationSeconds: number;
  overallScore: number;
  feedbackSummary?: string;
  radarData?: { metric: string; score: number }[];
  pieData?: { name: string; value: number }[];
  createdAt: Date;
}

const ConceptMirrorSchema: Schema<IConceptMirror> = new Schema({
  userId: { type: String, required: true, index: true },
  conceptName: { type: String, required: true, trim: true, maxlength: 200 },
  transcript: { type: String, required: true, trim: true, maxlength: 50000 },
  durationSeconds: {
    type: Number,
    default: 0,
    min: 0,
    max: 86400,
    validate: { validator: Number.isFinite, message: "Duration must be a finite number" },
  },
  overallScore: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    validate: { validator: Number.isFinite, message: "Overall score must be a finite number between 0 and 100" },
  },
  feedbackSummary: { type: String, trim: true, maxlength: 10000 },
  radarData: { type: [Schema.Types.Mixed], default: [] },
  pieData: { type: [Schema.Types.Mixed], default: [] },
  createdAt: { type: Date, default: Date.now },
});

ConceptMirrorSchema.index({ userId: 1, createdAt: -1 });

const ConceptMirror: Model<IConceptMirror> =
  mongoose.models.ConceptMirror ||
  mongoose.model<IConceptMirror>("ConceptMirror", ConceptMirrorSchema);

export default ConceptMirror;
```

### FILE 12: `src/models/MistakeEntry.ts`
```ts
import mongoose, { Schema, Document, Model } from "mongoose";

export interface IMistakeEntry extends Document {
  userId: string;
  title: string;
  subject: string;
  chapter?: string;
  errorType: "conceptual" | "calculation" | "formula" | "misread";
  questionOrPrompt?: string;
  myMistake: string;
  correctConcept: string;
  status: "unresolved" | "mastered";
  source?: "concept_mirror" | "nichod" | "manual";
  reviewCount: number;
  lastReviewedAt?: Date;
  createdAt: Date;
}

const MistakeEntrySchema = new Schema<IMistakeEntry>({
  userId: { type: String, required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  subject: { type: String, required: true, trim: true, maxlength: 60 },
  chapter: { type: String, trim: true, maxlength: 80 },
  errorType: {
    type: String,
    enum: ["conceptual", "calculation", "formula", "misread"],
    default: "conceptual",
  },
  questionOrPrompt: { type: String, trim: true, maxlength: 3000 },
  myMistake: { type: String, required: true, trim: true, maxlength: 2500 },
  correctConcept: { type: String, required: true, trim: true, maxlength: 2500 },
  status: {
    type: String,
    enum: ["unresolved", "mastered"],
    default: "unresolved",
    index: true,
  },
  source: {
    type: String,
    enum: ["concept_mirror", "nichod", "manual"],
    default: "manual",
  },
  reviewCount: {
    type: Number,
    default: 0,
    min: 0,
    validate: { validator: (v: number) => Number.isSafeInteger(v) && v >= 0, message: "Review count must be a non-negative integer" },
  },
  lastReviewedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

MistakeEntrySchema.index({ userId: 1, status: 1 });
MistakeEntrySchema.index({ userId: 1, subject: 1 });
MistakeEntrySchema.index({ userId: 1, createdAt: -1 });

const MistakeEntry: Model<IMistakeEntry> =
  mongoose.models.MistakeEntry ||
  mongoose.model<IMistakeEntry>("MistakeEntry", MistakeEntrySchema);

export default MistakeEntry;
```

### FILE 13: `src/models/EmailBroadcast.ts`
```ts
import mongoose, { Schema, Document, Model } from "mongoose";
import { PLATFORM_OWNER_EMAIL } from "@/lib/owner-access";

export interface IEmailBroadcast extends Document {
  sender: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  attachmentUrl?: string;
  attachmentName?: string;
  sentCount: number;
  status: "sent" | "failed";
  error?: string;
  sentAt: Date;
}

const EmailBroadcastSchema: Schema<IEmailBroadcast> = new Schema(
  {
    sender: { type: String, trim: true, default: PLATFORM_OWNER_EMAIL },
    to: { type: [String], required: true },
    cc: { type: [String], default: [] },
    bcc: { type: [String], default: [] },
    subject: { type: String, required: true, trim: true, maxlength: 300 },
    body: { type: String, required: true },
    attachmentUrl: { type: String, required: false, trim: true, maxlength: 2048 },
    attachmentName: { type: String, required: false, trim: true, maxlength: 255 },
    sentCount: {
      type: Number,
      default: 0,
      min: 0,
      validate: { validator: (v: number) => Number.isSafeInteger(v) && v >= 0, message: "Sent count must be a non-negative integer" },
    },
    status: { type: String, enum: ["sent", "failed"], default: "sent" },
    error: { type: String, required: false, maxlength: 2000 },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

EmailBroadcastSchema.index({ sentAt: -1 });

const EmailBroadcast: Model<IEmailBroadcast> =
  mongoose.models.EmailBroadcast ||
  mongoose.model<IEmailBroadcast>("EmailBroadcast", EmailBroadcastSchema);

export default EmailBroadcast;
```

### FILE 14: `src/models/StudyGroup.ts`
```ts
import mongoose, { Schema, Document, Model } from "mongoose";

export interface IStudyGroup extends Document {
  name: string;
  description: string;
  subject: string;
  examFocus?: string;
  schedule?: string;
  ownerId: string;
  memberIds: string[];
  createdAt: Date;
}

const StudyGroupSchema = new Schema<IStudyGroup>({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, required: true, trim: true, maxlength: 1000 },
  subject: { type: String, required: true, trim: true, maxlength: 80 },
  examFocus: { type: String, trim: true, maxlength: 80 },
  schedule: { type: String, trim: true, maxlength: 160 },
  ownerId: { type: String, required: true, index: true },
  memberIds: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
});

StudyGroupSchema.index({ memberIds: 1 });
StudyGroupSchema.index({ subject: 1 });
StudyGroupSchema.index({ createdAt: -1 });

const StudyGroup: Model<IStudyGroup> =
  mongoose.models.StudyGroup ||
  mongoose.model<IStudyGroup>("StudyGroup", StudyGroupSchema);

export default StudyGroup;
```

### FILE 15: `src/models/StudyStreak.ts`
```ts
import mongoose, { Schema, Document, Model } from "mongoose";

export interface IStudyStreak extends Document {
  userId: string;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string; // YYYY-MM-DD in IST (Asia/Kolkata)
  activityDates: string[]; // List of YYYY-MM-DD in IST
  updatedAt: Date;
}

const isNonNegativeSafeInt = (v: number) => Number.isSafeInteger(v) && v >= 0;

const StudyStreakSchema = new Schema<IStudyStreak>({
  userId: { type: String, required: true, unique: true },
  currentStreak: { type: Number, default: 0, min: 0, validate: { validator: isNonNegativeSafeInt, message: "Current streak must be a non-negative integer" } },
  longestStreak: { type: Number, default: 0, min: 0, validate: { validator: isNonNegativeSafeInt, message: "Longest streak must be a non-negative integer" } },
  lastActiveDate: { type: String, default: "" },
  activityDates: { type: [String], default: [] },
  updatedAt: { type: Date, default: Date.now },
});

const StudyStreak: Model<IStudyStreak> =
  mongoose.models.StudyStreak ||
  mongoose.model<IStudyStreak>("StudyStreak", StudyStreakSchema);

export default StudyStreak;
```

### FILE 16: `src/models/Broadcast.ts`
```ts
import mongoose, { Schema, Document, Model } from "mongoose";

export interface IBroadcast extends Document {
  subject: string;
  message: string;
  fileUrl?: string; // Optional for future file storage
  createdAt: Date;
  expiresAt: Date;
}

const BroadcastSchema: Schema<IBroadcast> = new Schema({
  subject: { type: String, required: true, trim: true, maxlength: 200 },
  message: { type: String, required: true, trim: true, maxlength: 10000 },
  fileUrl: { type: String, required: false, trim: true, maxlength: 2048 },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }
});

// Non-TTL index: cron must delete remote attachments before removing DB records.
BroadcastSchema.index({ expiresAt: 1 });
BroadcastSchema.index({ createdAt: -1 });

const Broadcast: Model<IBroadcast> = mongoose.models.Broadcast || mongoose.model<IBroadcast>("Broadcast", BroadcastSchema);

export default Broadcast;
```

### FILE 17: `src/models/Changelog.ts`
```ts
import mongoose, { Schema, Document, Model } from "mongoose";
import { PLATFORM_OWNER_USERNAME } from "@/lib/owner-access";

export interface IChangelog extends Document {
  version: string;
  title: string;
  category: "Major Update" | "Feature" | "Improvement" | "Bug Fix" | "Security";
  content: string; // Markdown or bullet points
  createdBy: string;
  releaseDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ChangelogSchema: Schema<IChangelog> = new Schema(
  {
    version: { type: String, required: true, trim: true, maxlength: 50 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    category: {
      type: String,
      enum: ["Major Update", "Feature", "Improvement", "Bug Fix", "Security"],
      default: "Feature",
    },
    content: { type: String, required: true, trim: true, maxlength: 20000 },
    createdBy: { type: String, trim: true, default: PLATFORM_OWNER_USERNAME },
    releaseDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

ChangelogSchema.index({ releaseDate: -1, createdAt: -1 });

const Changelog: Model<IChangelog> =
  mongoose.models.Changelog || mongoose.model<IChangelog>("Changelog", ChangelogSchema);

export default Changelog;
```

### FILE 18: `src/models/DirectMessage.ts`
```ts
import mongoose, { Schema, Document, Model } from "mongoose";

export interface IDirectMessage extends Document {
  conversationKey: string;
  participantIds: string[];
  senderId: string;
  senderUsername: string;
  body: string;
  createdAt: Date;
}

const DirectMessageSchema = new Schema<IDirectMessage>({
  conversationKey: { type: String, required: true, trim: true },
  participantIds: {
    type: [String],
    required: true,
    validate: {
      validator: (ids: string[]) => Array.isArray(ids) && ids.length === 2 && ids.every((id) => typeof id === "string" && id.trim().length > 0),
      message: "Direct messages must have exactly 2 valid participant IDs",
    },
  },
  senderId: { type: String, required: true, trim: true },
  senderUsername: { type: String, required: true, trim: true },
  body: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now },
});

DirectMessageSchema.index({ conversationKey: 1, createdAt: 1 });
DirectMessageSchema.index({ participantIds: 1, createdAt: -1 });

const DirectMessage: Model<IDirectMessage> =
  mongoose.models.DirectMessage ||
  mongoose.model<IDirectMessage>("DirectMessage", DirectMessageSchema);

export default DirectMessage;
```

### FILE 19: `src/models/GroupMessage.ts`
```ts
import mongoose, { Schema, Document, Model } from "mongoose";

export interface IGroupMessage extends Document {
  groupId: string;
  senderId: string;
  senderUsername: string;
  body: string;
  createdAt: Date;
}

const GroupMessageSchema = new Schema<IGroupMessage>({
  groupId: { type: String, required: true, trim: true },
  senderId: { type: String, required: true, trim: true },
  senderUsername: { type: String, required: true, trim: true },
  body: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now },
});

GroupMessageSchema.index({ groupId: 1, createdAt: 1 });

const GroupMessage: Model<IGroupMessage> =
  mongoose.models.GroupMessage ||
  mongoose.model<IGroupMessage>("GroupMessage", GroupMessageSchema);

export default GroupMessage;
```

---

## FINAL REQUIRED REPORT FORMAT
After committing all 19 files to `main`, output ONLY:
1. `COMMIT_SHAS`: exact SHA(s) pushed to `main`
2. `UPDATED_FILES_COUNT`: `X/19` (list any skipped/failed file if `< 19`)
3. `CI_RUN_ID` & `CI_RUN_STATUS`: workflow run ID, current status, and exact failing step/error lines if failed