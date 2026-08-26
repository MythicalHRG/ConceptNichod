"use server";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import Topic from "@/models/Topic";
import { format, subDays, startOfDay } from "date-fns";

export async function getPublicProfileData(username: string) {
  await dbConnect();
  
  // Helper to escape regex
  const escapeRegex = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const safeUsername = escapeRegex(username);

  // Fetch user, excluding sensitive fields like email and password
  const user = await User.findOne({ username: new RegExp(`^${safeUsername}$`, 'i') }).select("-password -email -uuid -_id -createdAt -__v");
  if (!user) {
    return null;
  }
  
  // Find all topics by this user
  // To link topics to user, we need their UUID because topics store `userId` which is the uuid.
  const userWithId = await User.findOne({ username: new RegExp(`^${safeUsername}$`, 'i') }).select("uuid");
  if (!userWithId) return null;
  
  const topics = await Topic.find({ userId: userWithId.uuid }).lean();
  
  // Only consider topics that have a final analysis
  const analyzedTopics = topics.filter(t => t.analysis && t.analysis.chartsData);
  const totalTopics = topics.length;
  
  // 1. Overall Score Average
  let totalScore = 0;
  let scoreCount = 0;
  analyzedTopics.forEach(t => {
      if (t.analysis && typeof t.analysis.overallScore === 'number') {
          totalScore += t.analysis.overallScore;
          scoreCount++;
      }
  });
  const averageScore = scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0;

  // 2. Aggregate Charts Data
  // Group by title and type
  const chartAggregator = new Map<string, any>();
  
  analyzedTopics.forEach(t => {
      try {
          const charts = JSON.parse(t.analysis.chartsData);
          charts.forEach((chart: any) => {
              const key = `${chart.title}-${chart.type}`;
              if (!chartAggregator.has(key)) {
                  chartAggregator.set(key, {
                      type: chart.type,
                      title: chart.title,
                      config: chart.config, // Just take the config from the first one
                      dataMap: new Map<string, any>(),
                      count: 0
                  });
              }
              const agg = chartAggregator.get(key);
              agg.count++;
              
              if (Array.isArray(chart.data)) {
                  chart.data.forEach((d: any) => {
                      if (!d.name) return;
                      if (!agg.dataMap.has(d.name)) {
                          agg.dataMap.set(d.name, { score: 0, value: 0, fill: d.fill, count: 0 });
                      }
                      const metric = agg.dataMap.get(d.name);
                      metric.count++;
                      if (typeof d.score === 'number') metric.score += d.score;
                      if (typeof d.value === 'number') metric.value += d.value;
                  });
              }
          });
      } catch (e) {
          // ignore parsing errors
      }
  });

  // Re-build aggregated charts
  const aggregatedChartsDataArray = Array.from(chartAggregator.values()).map(agg => {
      const averagedData = Array.from(agg.dataMap.entries()).map(([name, metric]: [string, any]) => {
          const res: any = { name };
          if (metric.score > 0) res.score = Math.round(metric.score / metric.count);
          if (metric.value > 0) res.value = Math.round(metric.value / metric.count);
          if (metric.fill) res.fill = metric.fill;
          return res;
      });
      return {
          type: agg.type,
          title: agg.title,
          config: agg.config,
          data: averagedData
      };
  });
  
  const aggregatedChartsData = JSON.stringify(aggregatedChartsDataArray);
  
  // 3. Subject Distribution (Pie Chart)
  const subjectMap = new Map<string, number>();
  topics.forEach(t => {
    const subj = t.subject || "Unknown";
    subjectMap.set(subj, (subjectMap.get(subj) || 0) + 1);
  });
  const subjectDistribution = Array.from(subjectMap.entries()).map(([name, value]) => ({ name, value }));
  
  // 4. Chapter Distribution (Histogram proxy)
  const chapterMap = new Map<string, number>();
  topics.forEach(t => {
    const chap = t.chapter || "Unknown";
    chapterMap.set(chap, (chapterMap.get(chap) || 0) + 1);
  });
  // Sort by count descending, take top 15 to avoid clutter
  const chapterDistribution = Array.from(chapterMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 15);
    
  // 5. Activity over time (Bar Graph - Last 30 days)
  const activityMap = new Map<string, number>();
  // Initialize last 30 days with 0
  for (let i = 29; i >= 0; i--) {
    const d = subDays(startOfDay(new Date()), i);
    activityMap.set(format(d, "MMM dd"), 0);
  }
  
  topics.forEach(t => {
    const dateKey = format(startOfDay(new Date(t.createdAt)), "MMM dd");
    if (activityMap.has(dateKey)) {
      activityMap.set(dateKey, activityMap.get(dateKey)! + 1);
    }
  });
  
  const activityTimeline = Array.from(activityMap.entries()).map(([date, count]) => ({ date, count }));
  
  return {
    user: user.toObject(),
    totalTopics,
    averageScore,
    aggregatedChartsData,
    subjectDistribution,
    chapterDistribution,
    activityTimeline
  };
}
