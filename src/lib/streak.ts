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
