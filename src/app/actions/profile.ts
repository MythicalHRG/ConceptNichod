"use server";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import Topic from "@/models/Topic";
import { format, subDays, startOfDay } from "date-fns";

export async function getPublicProfileData(username: string) {
  await dbConnect();
  
  const escapeRegex = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const safeUsername = escapeRegex(username);

  const user = await User.findOne({ username: new RegExp(`^${safeUsername}$`, 'i') }).select("-password -email -uuid -_id -createdAt -__v");
  if (!user) {
    return null;
  }
  
  const userWithId = await User.findOne({ username: new RegExp(`^${safeUsername}$`, 'i') }).select("uuid");
  if (!userWithId) return null;
  
  const topics = await Topic.find({ userId: userWithId.uuid }).lean();
  
  const analyzedTopics = topics.filter(t => t.analysis && typeof t.analysis.overallScore === 'number');
  const totalTopics = topics.length;
  
  // 1. Overall Score Average
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

  // 3. Histogram: Score Distribution (Concept Mirror)
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

  // 4. Bar Chart: Skill Averages (Concept Mirror combined with Concept Nichod generated topics)
  const skillAggregator = new Map<string, { total: number, count: number }>();
  
  analyzedTopics.forEach(t => {
      try {
          if (t.analysis.chartsData) {
            const charts = JSON.parse(t.analysis.chartsData);
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
      } catch (e) {
          // ignore parse errors
      }
  });

  const skillAverages = Array.from(skillAggregator.entries()).map(([name, metric]) => ({
      name,
      score: Math.round(metric.total / metric.count)
  })).sort((a, b) => b.score - a.score);

  return {
    user: user.toObject(),
    totalTopics,
    averageScore,
    subjectDistribution,
    scoreDistribution,
    skillAverages
  };
}
