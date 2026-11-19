"use server";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import Topic from "@/models/Topic";
import ConceptMirror from "@/models/ConceptMirror";
import { computeUserBadges } from "@/lib/badges";

export async function getPublicProfileData(username: string) {
  await dbConnect();
  
  const escapeRegex = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const safeUsername = escapeRegex(username);

  const user = await User.findOne({ username: new RegExp(`^${safeUsername}$`, 'i') }).select("username fullName classLevel examFocus city instagram snapchat bio");
  if (!user) {
    return null;
  }
  
  const userWithId = await User.findOne({ username: new RegExp(`^${safeUsername}$`, 'i') }).select("uuid username");
  if (!userWithId) return null;
  
  const topics = await Topic.find({ userId: userWithId.uuid }).lean();
  
  const analyzedTopics = topics.filter(t =>
    t.analysis && Number.isFinite(t.analysis.overallScore) && t.analysis.overallScore >= 0 && t.analysis.overallScore <= 100
  );
  const totalTopics = topics.length;
  
  // 1. Overall Score Average (ConceptNichod Topics)
  let totalScore = 0;
  analyzedTopics.forEach(t => {
      totalScore += t.analysis.overallScore;
  });
  const averageScore = analyzedTopics.length > 0 ? Math.round(totalScore / analyzedTopics.length) : 0;

  // 2. Pie Chart: Subject Distribution (ConceptNichod)
  const subjectMap = new Map<string, number>();
  topics.forEach(t => {
    const subj = t.subject || "Unknown";
    subjectMap.set(subj, (subjectMap.get(subj) || 0) + 1);
  });
  const subjectDistribution = Array.from(subjectMap.entries()).map(([name, value]) => ({ name, value }));

  // 3. Histogram: Score Distribution (ConceptNichod)
  const scoreBuckets = [
    { name: "0-20", min: 0, max: 20, count: 0 },
    { name: "21-40", min: 21, max: 40, count: 0 },
    { name: "41-60", min: 41, max: 60, count: 0 },
    { name: "61-80", min: 61, max: 80, count: 0 },
    { name: "81-100", min: 81, max: 100, count: 0 },
  ];
  analyzedTopics.forEach(t => {
    const score = t.analysis.overallScore;
    for (const bucket of scoreBuckets) {
      if (score >= bucket.min && score <= bucket.max) {
        bucket.count++;
        break;
      }
    }
  });
  const scoreDistribution = scoreBuckets.map(b => ({ name: b.name, value: b.count }));

  // 4. Bar Chart: Skill Averages (ConceptNichod generated topics)
  const skillAggregator = new Map<string, { total: number, count: number }>();
  
  analyzedTopics.forEach(t => {
      try {
          if (t.analysis.chartsData) {
            const charts = typeof t.analysis.chartsData === 'string' ? JSON.parse(t.analysis.chartsData) : t.analysis.chartsData;
            if (Array.isArray(charts)) {
              charts.forEach((chart: any) => {
                  if (Array.isArray(chart.data)) {
                      chart.data.forEach((d: any) => {
                          if (typeof d.name === 'string' && d.name.trim() && d.name.length <= 80 && Number.isFinite(d.score)) {
                              if (!skillAggregator.has(d.name)) {
                                  skillAggregator.set(d.name, { total: 0, count: 0 });
                              }
                              const metric = skillAggregator.get(d.name)!;
                              metric.total += Math.max(0, Math.min(100, d.score));
                              metric.count++;
                          }
                      });
                  }
              });
            }
          }
      } catch (e) {
          // ignore parse errors
      }
  });

  const skillAverages = Array.from(skillAggregator.entries()).map(([name, metric]) => ({
      name,
      score: Math.round(metric.total / metric.count)
  })).sort((a, b) => b.score - a.score);

  // 5. Polynomial Learning Trajectory: Sequential performance across assessed topics
  const learningProgression = analyzedTopics
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-7)
    .map((t, idx) => ({
      session: t.name ? (t.name.length > 14 ? t.name.slice(0, 12) + '..' : t.name) : `Topic ${idx + 1}`,
      score: t.analysis.overallScore
    }));

  // 6. Concept Mirror Analytics (Verbal Oral Defense & Speech Explanations)
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
    const mirrorDocs = await ConceptMirror.find({ userId: userWithId.uuid })
      .sort({ createdAt: -1 })
      .lean();

    const validMirrorDocs = mirrorDocs.filter((doc: any) =>
      Number.isFinite(doc.overallScore) && doc.overallScore >= 0 && doc.overallScore <= 100
    );

    if (validMirrorDocs.length > 0) {
      let totalMirrorScore = 0;
      let totalMirrorDuration = 0;
      const mirrorSkillMap = new Map<string, { total: number; count: number }>();

      validMirrorDocs.forEach((doc: any) => {
        totalMirrorScore += Math.max(0, Math.min(100, doc.overallScore));
        const duration = Number.isFinite(doc.durationSeconds) ? Math.max(0, Math.min(86400, doc.durationSeconds)) : 0;
        totalMirrorDuration += duration;
        if (Array.isArray(doc.radarData)) {
          doc.radarData.forEach((r: any) => {
            if (typeof r.metric === "string" && r.metric.trim() && r.metric.length <= 80 && Number.isFinite(r.score)) {
              if (!mirrorSkillMap.has(r.metric)) mirrorSkillMap.set(r.metric, { total: 0, count: 0 });
              const metric = mirrorSkillMap.get(r.metric)!;
              metric.total += Math.max(0, Math.min(100, r.score));
              metric.count++;
            }
          });
        }
      });

      const avgMirrorScore = Math.round(totalMirrorScore / validMirrorDocs.length);
      const mirrorSkillAverages = Array.from(mirrorSkillMap.entries()).map(([name, m]) => ({
        name,
        score: Math.round(m.total / m.count),
      })).sort((a, b) => b.score - a.score);

      // If no written topics exist yet, populate learning trajectory from oral defenses
      if (learningProgression.length === 0 && validMirrorDocs.length > 0) {
        validMirrorDocs
          .slice()
          .reverse()
          .slice(-7)
          .forEach((m: any, idx: number) => {
            learningProgression.push({
              session: m.conceptName ? (m.conceptName.length > 14 ? m.conceptName.slice(0, 12) + '..' : m.conceptName) : `Session ${idx + 1}`,
              score: typeof m.overallScore === 'number' ? m.overallScore : 0,
            });
          });
      }

      const recentSessions = validMirrorDocs.slice(0, 6).map((doc: any) => ({
        id: doc._id?.toString() || '',
        conceptName: typeof doc.conceptName === "string" ? doc.conceptName.slice(0, 200) : "Concept session",
        overallScore: Math.max(0, Math.min(100, doc.overallScore)),
        durationSeconds: Number.isFinite(doc.durationSeconds) ? Math.max(0, Math.min(86400, doc.durationSeconds)) : 0,
        createdAt: Number.isFinite(new Date(doc.createdAt).getTime()) ? doc.createdAt : new Date(0),
      }));

      conceptMirrorAnalytics = {
        totalSessions: validMirrorDocs.length,
        averageScore: avgMirrorScore,
        totalDurationSeconds: totalMirrorDuration,
        skillAverages: mirrorSkillAverages,
        recentSessions,
      };
    }
  } catch (err) {
    console.warn("Could not query ConceptMirror records:", err);
  }

  // 7. Dynamic Badge System Calculation
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
