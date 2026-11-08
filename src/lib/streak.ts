import dbConnect from "@/lib/mongoose";
import StudyStreak from "@/models/StudyStreak";

/**
 * Updates a user's study streak using strictly server-side UTC timestamps.
 */
export async function recordUserStudyActivity(userId: string): Promise<{
  currentStreak: number;
  longestStreak: number;
}> {
  if (!userId) return { currentStreak: 0, longestStreak: 0 };
  await dbConnect();

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

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
  const todayStr = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  // If last activity is older than yesterday, the active streak is currently broken (0)
  const isStreakLive =
    streakDoc.lastActiveDate === todayStr ||
    streakDoc.lastActiveDate === yesterdayStr;

  return {
    currentStreak: isStreakLive ? streakDoc.currentStreak : 0,
    longestStreak: streakDoc.longestStreak,
    lastActiveDate: streakDoc.lastActiveDate,
  };
}
