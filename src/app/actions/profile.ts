"use server";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import Topic from "@/models/Topic";
import ConceptMirror from "@/models/ConceptMirror";
import { computeUserBadges } from "@/lib/badges";

export async function getPublicProfileData(username: string) {
  await dbConnect();

  const escapeRegex = (string: string) => string.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
  const safeUsername = escapeRegex(username);
  const usernamePattern = new RegExp("^" + safeUsername + "$", "i");

  const user = await User.findOne({ username: usernamePattern })
    .select("username fullName classLevel examFocus city instagram snapchat bio");
  if (!user) return null;

  const userWithId = await User.findOne({ username: usernamePattern })
    .select("uuid username");
  if (!userWithId) return null;

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
  const recentAnalyzedTopics: Array<{ name?: string; score: number }> = [];

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
    totalScore += score;
    analyzedTopicCount += 1;

    for (const bucket of scoreBuckets) {
      if (score >= bucket.min && score <= bucket.max) {
        bucket.count += 1;
        break;
      }
    }

    if (recentAnalyzedTopics.length < 7) {
      recentAnalyzedTopics.push({
        name: typeof t.name === "string" ? t.name : undefined,
        score,
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
            if (Array.isArray(chart.data)) {
              chart.data.forEach((d: any) => {
                if (
                  typeof d.name === "string" &&
                  d.name.trim() &&
                  d.name.length <= 80 &&
                  Number.isFinite(d.score)
                ) {
                  if (!skillAggregator.has(d.name)) {
                    skillAggregator.set(d.name, { total: 0, count: 0 });
                  }
                  const metric = skillAggregator.get(d.name)!;
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

  // The cursor is newest-first; reverse the bounded seven-point window for display.
  const learningProgression = recentAnalyzedTopics
    .reverse()
    .map((t, idx) => ({
      session: t.name
        ? t.name.length > 14
          ? t.name.slice(0, 12) + ".."
          : t.name
        : "Topic " + (idx + 1),
      score: t.score,
    }));

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
            typeof r.metric === "string" &&
            r.metric.trim() &&
            r.metric.length <= 80 &&
            Number.isFinite(r.score)
          ) {
            if (!mirrorSkillMap.has(r.metric)) {
              mirrorSkillMap.set(r.metric, { total: 0, count: 0 });
            }
            const metric = mirrorSkillMap.get(r.metric)!;
            metric.total += Math.max(0, Math.min(100, r.score));
            metric.count += 1;
          }
        });
      }

      if (recentMirrorDocs.length < 7) recentMirrorDocs.push(doc);
    }

    if (validMirrorCount > 0) {
      const avgMirrorScore = Math.round(totalMirrorScore / validMirrorCount);
      const mirrorSkillAverages = Array.from(mirrorSkillMap.entries())
        .map(([name, metric]) => ({
          name,
          score: Math.round(metric.total / metric.count),
        }))
        .sort((a, b) => b.score - a.score);

      if (learningProgression.length === 0) {
        recentMirrorDocs
          .slice()
          .reverse()
          .forEach((m: any, idx: number) => {
            learningProgression.push({
              session: m.conceptName
                ? m.conceptName.length > 14
                  ? m.conceptName.slice(0, 12) + ".."
                  : m.conceptName
                : "Session " + (idx + 1),
              score: typeof m.overallScore === "number" ? m.overallScore : 0,
            });
          });
      }

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
          ? doc.createdAt
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

  let badges: any[] = [];
  let topBadge: any = null;
  try {
    const badgeRes = await computeUserBadges(userWithId.uuid, userWithId.username);
    badges = badgeRes.badges;
    topBadge = badgeRes.topBadge;
  } catch (err) {
    console.warn("Could not compute user badges:", err);
  }

  return {
    user: user.toObject(),
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
