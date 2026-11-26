"use server";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import Topic from "@/models/Topic";
import ConceptMirror from "@/models/ConceptMirror";
import { computeUserBadges } from "@/lib/badges";

const MAX_SKILL_KEYS = 50;

export async function getPublicProfileData(username: string) {
  if (typeof username !== "string") return null;
  const cleanUsername = username.trim();
  if (!cleanUsername || cleanUsername.length > 64) return null;

  await dbConnect();

  const escapeRegex = (string: string) => string.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
  const safeUsername = escapeRegex(cleanUsername);
  const usernamePattern = new RegExp("^" + safeUsername + "$", "i");

  const user = await User.findOne({ username: usernamePattern })
    .select("username fullName classLevel examFocus city instagram snapchat bio publicProfileEnabled")
    .lean();
  if (!user || user.publicProfileEnabled !== true) return null;

  const userWithId = await User.findOne({ username: usernamePattern })
    .select("uuid username")
    .lean();
  if (!userWithId) return null;

  // Streamed replacement for validMirrorDocs = mirrorDocs.filter(...); only a seven-item recent window is retained.
  // Stream projected topic records in bounded batches. All-time summary math is
  // retained, but historical documents are never materialized as one JS array.
  const topicCursor = Topic.find({ userId: userWithId.uuid })
    .select("subject analysis.overallScore analysis.chartsData name createdAt")
    .sort({ createdAt: -1, _id: -1 })
    .lean()
    .cursor({ batchSize: 250 });

  let totalTopics = 0;
  let totalScore = 0;
  let analyzedTopicCount = 0;
  const subjectMap = new Map<string, number>();
  const scoreBuckets = [
    { name: "0-20", min: 0, max: 20, count: 0 },
    { name: "21-40", min: 21, max: 40, count: 0 },
    { name: "41-60", min: 41, max: 60, count: 0 },
    { name: "61-80", min: 61, max: 80, count: 0 },
    { name: "81-100", min: 81, max: 100, count: 0 },
  ];
  const skillAggregator = new Map<string, { total: number; count: number }>();
  const recentAnalyzedTopics: Array<{ name?: string; score: number; createdAt: Date }> = [];

  try {
    for await (const t of topicCursor) {
      totalTopics += 1;
      const subject = t.subject || "Unknown";
      subjectMap.set(subject, (subjectMap.get(subject) || 0) + 1);

      if (
        !t.analysis ||
        !Number.isFinite(t.analysis.overallScore) ||
        t.analysis.overallScore < 0 ||
        t.analysis.overallScore > 100
      ) {
        continue;
      }

      const score = t.analysis.overallScore;
      const roundedBucketScore = Math.max(0, Math.min(100, Math.round(score)));
      totalScore += score;
      analyzedTopicCount += 1;

      for (const bucket of scoreBuckets) {
        if (roundedBucketScore >= bucket.min && roundedBucketScore <= bucket.max) {
          bucket.count += 1;
          break;
        }
      }

      if (recentAnalyzedTopics.length < 7) {
        recentAnalyzedTopics.push({
          name: typeof t.name === "string" ? t.name : undefined,
          score,
          createdAt: new Date(t.createdAt),
        });
      }

      try {
        if (t.analysis.chartsData) {
          const charts =
            typeof t.analysis.chartsData === "string"
              ? JSON.parse(t.analysis.chartsData)
              : t.analysis.chartsData;
          if (Array.isArray(charts)) {
            charts.forEach((chart: any) => {
              if (Array.isArray(chart?.data)) {
                chart.data.forEach((d: any) => {
                  if (
                    typeof d?.name === "string" &&
                    d.name.trim() &&
                    d.name.length <= 80 &&
                    Number.isFinite(d.score)
                  ) {
                    const metricName = d.name.trim();
                    if (!skillAggregator.has(metricName)) {
                      if (skillAggregator.size >= MAX_SKILL_KEYS) return;
                      skillAggregator.set(metricName, { total: 0, count: 0 });
                    }
                    const metric = skillAggregator.get(metricName)!;
                    metric.total += Math.max(0, Math.min(100, d.score));
                    metric.count += 1;
                  }
                });
              }
            });
          }
        }
      } catch {
        // Ignore malformed historical chart JSON without failing the public profile.
      }
    }
  } finally {
    await topicCursor.close().catch(() => {});
  }

  const averageScore =
    analyzedTopicCount > 0 ? Math.round(totalScore / analyzedTopicCount) : 0;
  const subjectDistribution = Array.from(subjectMap.entries()).map(
    ([name, value]) => ({ name, value })
  );
  const scoreDistribution = scoreBuckets.map((bucket) => ({
    name: bucket.name,
    value: bucket.count,
  }));
  const skillAverages = Array.from(skillAggregator.entries())
    .map(([name, metric]) => ({
      name,
      score: Math.round(metric.total / metric.count),
    }))
    .sort((a, b) => b.score - a.score);

  let learningProgression: { session: string; score: number }[] = [];

  const recentMirrorProgression: Array<{ name?: string; score: number; createdAt: Date }> = [];

  let conceptMirrorAnalytics = {
    totalSessions: 0,
    averageScore: 0,
    totalDurationSeconds: 0,
    skillAverages: [] as { name: string; score: number }[],
    recentSessions: [] as {
      id: string;
      conceptName: string;
      overallScore: number;
      durationSeconds: number;
      createdAt: Date;
    }[],
  };

  try {
    // Mirror history is streamed as well. Only the six recent sessions and seven
    // progression candidates are retained; all-time totals and skill means remain exact.
    const mirrorCursor = ConceptMirror.find({ userId: userWithId.uuid })
      .select("overallScore durationSeconds radarData conceptName createdAt")
      .sort({ createdAt: -1, _id: -1 })
      .lean()
      .cursor({ batchSize: 250 });

    let validMirrorCount = 0;
    let totalMirrorScore = 0;
    let totalMirrorDuration = 0;
    const mirrorSkillMap = new Map<string, { total: number; count: number }>();
    const recentMirrorDocs: any[] = [];

    try {
      for await (const doc of mirrorCursor) {
        if (
          !Number.isFinite(doc.overallScore) ||
          doc.overallScore < 0 ||
          doc.overallScore > 100
        ) {
          continue;
        }

        validMirrorCount += 1;
        totalMirrorScore += Math.max(0, Math.min(100, doc.overallScore));
        const duration = Number.isFinite(doc.durationSeconds)
          ? Math.max(0, Math.min(86400, doc.durationSeconds))
          : 0;
        totalMirrorDuration += duration;

        if (Array.isArray(doc.radarData)) {
          doc.radarData.forEach((r: any) => {
            if (
              typeof r?.metric === "string" &&
              r.metric.trim() &&
              r.metric.length <= 80 &&
              Number.isFinite(r.score)
            ) {
              const metricName = r.metric.trim();
              if (!mirrorSkillMap.has(metricName)) {
                if (mirrorSkillMap.size >= MAX_SKILL_KEYS) return;
                mirrorSkillMap.set(metricName, { total: 0, count: 0 });
              }
              const metric = mirrorSkillMap.get(metricName)!;
              metric.total += Math.max(0, Math.min(100, r.score));
              metric.count += 1;
            }
          });
        }

        if (recentMirrorDocs.length < 7) {
          recentMirrorDocs.push(doc);
          recentMirrorProgression.push({
            name: typeof doc.conceptName === "string" ? doc.conceptName : undefined,
            score: Math.max(0, Math.min(100, doc.overallScore)),
            createdAt: new Date(doc.createdAt),
          });
        }
      }
    } finally {
      await mirrorCursor.close().catch(() => {});
    }

    if (validMirrorCount > 0) {
      const avgMirrorScore = Math.round(totalMirrorScore / validMirrorCount);
      const mirrorSkillAverages = Array.from(mirrorSkillMap.entries())
        .map(([name, metric]) => ({
          name,
          score: Math.round(metric.total / metric.count),
        }))
        .sort((a, b) => b.score - a.score);


      const recentSessions = recentMirrorDocs.slice(0, 6).map((doc: any) => ({
        id: doc._id?.toString() || "",
        conceptName:
          typeof doc.conceptName === "string"
            ? doc.conceptName.slice(0, 200)
            : "Concept session",
        overallScore: Math.max(0, Math.min(100, doc.overallScore)),
        durationSeconds: Number.isFinite(doc.durationSeconds)
          ? Math.max(0, Math.min(86400, doc.durationSeconds))
          : 0,
        createdAt: Number.isFinite(new Date(doc.createdAt).getTime())
          ? new Date(doc.createdAt)
          : new Date(0),
      }));

      conceptMirrorAnalytics = {
        totalSessions: validMirrorCount,
        averageScore: avgMirrorScore,
        totalDurationSeconds: totalMirrorDuration,
        skillAverages: mirrorSkillAverages,
        recentSessions,
      };
    }
  } catch (err) {
    console.warn("Could not query ConceptMirror records:", err);
  }

  // Combine recent written-topic and oral-defense scores into one chronological
  // timeline so new Concept Mirror sessions are not hidden by older written tests.
  const activityEvents = [
    ...recentAnalyzedTopics.map((item) => ({ ...item, label: "Topic" })),
    ...recentMirrorProgression.map((item) => ({ ...item, label: "Mirror" })),
  ].filter((item) => Number.isFinite(item.createdAt.getTime()) && Number.isFinite(item.score))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(-12);

  learningProgression = activityEvents.map((item, index) => {
    const rawName = item.name?.trim();
    const shortName = rawName
      ? rawName.length > 12 ? rawName.slice(0, 10) + ".." : rawName
      : item.label + " " + (index + 1);
    return {
      session: item.label + ": " + shortName,
      score: Math.max(0, Math.min(100, item.score)),
    };
  });

  let badges: any[] = [];
  let topBadge: any = null;
  try {
    const badgeRes = await computeUserBadges(userWithId.uuid, userWithId.username);
    badges = badgeRes.badges;
    topBadge = badgeRes.topBadge;
  } catch (err) {
    console.warn("Could not compute user badges:", err);
  }

  const publicUser = {
    username: user.username,
    fullName: user.fullName,
    classLevel: user.classLevel,
    examFocus: user.examFocus,
    city: user.city,
    instagram: user.instagram,
    snapchat: user.snapchat,
    bio: user.bio,
  };

  return {
    user: publicUser,
    totalTopics,
    averageScore,
    subjectDistribution,
    scoreDistribution,
    skillAverages,
    learningProgression,
    conceptMirror: conceptMirrorAnalytics,
    badges,
    topBadge,
  };
}
