"use server";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import Topic from "@/models/Topic";
import ConceptMirror from "@/models/ConceptMirror";

export async function getPublicProfileData(username: string) {
  await dbConnect();
  
  const escapeRegex = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const safeUsername = escapeRegex(username);

  const user = await User.findOne({ username: new RegExp(`^${safeUsername}$`, 'i'), isDiscoverable: true })
    .select("username fullName classLevel examFocus city shareLocation shareProgress shareSocialLinks bio snapchat instagram").lean();
  if (!user) {
    return null;
  }

  const publicUser = {
    username: user.username,
    fullName: user.fullName,
    classLevel: user.classLevel,
    examFocus: user.examFocus,
    city: user.shareLocation ? user.city : undefined,
    bio: user.bio,
    snapchat: user.shareSocialLinks ? user.snapchat : undefined,
    instagram: user.shareSocialLinks ? user.instagram : undefined,
  };

  if (!user.shareProgress) {
    return {
      user: publicUser,
      shareProgress: false,
      totalTopics: 0,
      averageScore: 0,
      subjectDistribution: [],
      scoreDistribution: [],
      skillAverages: [],
      learningProgression: [],
      conceptMirror: { totalSessions: 0, averageScore: 0, totalDurationSeconds: 0, skillAverages: [], recentSessions: [] },
    };
  }

  const userWithId = await User.findOne({ username: new RegExp(`^${safeUsername}$`, 'i'), isDiscoverable: true }).select("uuid").lean();
  if (!userWithId) return null;
  const topics = await Topic.find({ userId: userWithId.uuid }).lean();
  
  const analyzedTopics = topics.filter(t => t.analysis && typeof t.analysis.overallScore === 'number');
  const totalTopics = topics.length;
  
  // 1. Overall Score Average (Concept Nichod Topics)
  let totalScore = 0;
  analyzedTopics.forEach(t => {
      totalScore += t.analysis.overallScore;
  });
  const averageScore = analyzedTopics.length > 0 ? Math.round(totalScore / analyzedTopics.length) : 0;

  // 2. Pie Chart: Subject Distribution (Concept Nichod)
  const subjectMap = new Map<string, number>();
  topics.forEach(t => {
    const subj = t.subject || "Unknown";
    subjectMap.set(subj, (subjectMap.get(subj) || 0) + 1);
  });
  const subjectDistribution = Array.from(subjectMap.entries()).map(([name, value]) => ({ name, value }));

  // 3. Histogram: Score Distribution (Concept Nichod)
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

  // 4. Bar Chart: Skill Averages (Concept Nichod generated topics)
  const skillAggregator = new Map<string, { total: number, count: number }>();
  
  analyzedTopics.forEach(t => {
      try {
          if (t.analysis.chartsData) {
            const charts = typeof t.analysis.chartsData === 'string' ? JSON.parse(t.analysis.chartsData) : t.analysis.chartsData;
            if (Array.isArray(charts)) {
              charts.forEach((chart: any) => {
                  if (Array.isArray(chart.data)) {
                      chart.data.forEach((d: any) => {
                          if (d.name && typeof d.score === 'number') {
                              if (!skillAggregator.has(d.name)) {
                                  skillAggregator.set(d.name, { total: 0, count: 0 });
                              }
                              const metric = skillAggregator.get(d.name)!;
                              metric.total += d.score;
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
      session: `Session ${idx + 1}`,
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
      session: string;
      overallScore: number;
      durationSeconds: number;
      createdAt: Date;
    }[],
  };

  try {
    const mirrorDocs = await ConceptMirror.find({ userId: userWithId.uuid })
      .sort({ createdAt: -1 })
      .lean();

    if (mirrorDocs.length > 0) {
      let totalMirrorScore = 0;
      let totalMirrorDuration = 0;
      const mirrorSkillMap = new Map<string, { total: number; count: number }>();

      mirrorDocs.forEach((doc: any) => {
        totalMirrorScore += doc.overallScore || 0;
        totalMirrorDuration += doc.durationSeconds || 0;
        if (Array.isArray(doc.radarData)) {
          doc.radarData.forEach((r: any) => {
            if (r.metric && typeof r.score === 'number') {
              if (!mirrorSkillMap.has(r.metric)) {
                mirrorSkillMap.set(r.metric, { total: 0, count: 0 });
              }
              const m = mirrorSkillMap.get(r.metric)!;
              m.total += r.score;
              m.count++;
            }
          });
        }
      });

      const avgMirrorScore = Math.round(totalMirrorScore / mirrorDocs.length);
      const mirrorSkillAverages = Array.from(mirrorSkillMap.entries()).map(([name, m]) => ({
        name,
        score: Math.round(m.total / m.count),
      })).sort((a, b) => b.score - a.score);

      const recentSessions = mirrorDocs.slice(0, 6).map((doc: any, idx: number) => ({
        id: doc._id?.toString() || '',
        session: `Session ${idx + 1}`,
        overallScore: doc.overallScore,
        durationSeconds: doc.durationSeconds || 0,
        createdAt: doc.createdAt,
      }));

      conceptMirrorAnalytics = {
        totalSessions: mirrorDocs.length,
        averageScore: avgMirrorScore,
        totalDurationSeconds: totalMirrorDuration,
        skillAverages: mirrorSkillAverages,
        recentSessions,
      };
    }
  } catch (err) {
    console.warn("Could not query ConceptMirror records:", err);
  }

  return {
    user: publicUser,
    shareProgress: true,
    totalTopics,
    averageScore,
    subjectDistribution,
    scoreDistribution,
    skillAverages,
    learningProgression,
    conceptMirror: conceptMirrorAnalytics,
  };
}
