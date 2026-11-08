import dbConnect from "@/lib/mongoose";
import StudyStreak from "@/models/StudyStreak";

/**
 * Returns date in YYYY-MM-DD format strictly in Indian Standard Time (Asia/Kolkata).
 * Ensures students studying past midnight (00:00 - 05:30 IST) are credited with the correct Indian calendar day.
 */
export function getIstDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

export function getYesterdayIstDateString(date: Date = new Date()): string {
  const prev = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  return getIstDateString(prev);
}

/**
 * Updates a user's study streak using server-side IST timestamps.
 */
export async function recordUserStudyActivity(userId: string): Promise<{
  currentStreak: number;
  longestStreak: number;
}> {
  if (!userId) return { currentStreak: 0, longestStreak: 0 };
  await dbConnect();

  const now = new Date();
  const todayStr = getIstDateString(now);
  const yesterdayStr = getYesterdayIstDateString(now);

  let streakDoc = await StudyStreak.findOne({ userId });

  if (!streakDoc) {
    streakDoc = new StudyStreak({
      userId,
      currentStreak: 1,
      longestStreak: 1,
      lastActiveDate: todayStr,
      activityDates: [todayStr],
      updatedAt: now,
    });
    await streakDoc.save();
    return { currentStreak: 1, longestStreak: 1 };
  }

  if (streakDoc.lastActiveDate === todayStr) {
    return {
      currentStreak: streakDoc.currentStreak,
      longestStreak: streakDoc.longestStreak,
    };
  }

  if (streakDoc.lastActiveDate === yesterdayStr) {
    streakDoc.currentStreak += 1;
  } else {
    streakDoc.currentStreak = 1;
  }

  if (streakDoc.currentStreak > streakDoc.longestStreak) {
    streakDoc.longestStreak = streakDoc.currentStreak;
  }

  streakDoc.lastActiveDate = todayStr;
  if (!streakDoc.activityDates.includes(todayStr)) {
    streakDoc.activityDates.push(todayStr);
  }
  streakDoc.updatedAt = now;
  await streakDoc.save();

  return {
    currentStreak: streakDoc.currentStreak,
    longestStreak: streakDoc.longestStreak,
  };
}

export async function getUserStreak(userId: string): Promise<{
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string;
}> {
  if (!userId) return { currentStreak: 0, longestStreak: 0, lastActiveDate: "" };
  await dbConnect();

  const streakDoc = await StudyStreak.findOne({ userId }).lean();
  if (!streakDoc) return { currentStreak: 0, longestStreak: 0, lastActiveDate: "" };

  const now = new Date();
  const todayStr = getIstDateString(now);
  const yesterdayStr = getYesterdayIstDateString(now);

  // If last activity is older than yesterday in IST, the active streak is currently broken (0)
  const isStreakLive =
    streakDoc.lastActiveDate === todayStr ||
    streakDoc.lastActiveDate === yesterdayStr;

  return {
    currentStreak: isStreakLive ? streakDoc.currentStreak : 0,
    longestStreak: streakDoc.longestStreak,
    lastActiveDate: streakDoc.lastActiveDate,
  };
}
