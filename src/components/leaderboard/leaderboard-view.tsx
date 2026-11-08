"use client";

import { useEffect, useState, useTransition } from "react";
import {
  getLeaderboardDataAction,
  LeaderboardEntry,
  TrajectoryPoint,
} from "@/app/actions/leaderboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Trophy,
  Flame,
  TrendingUp,
  BrainCircuit,
  Medal,
  Award,
  Crown,
  Search,
  Filter,
  Sparkles,
  Loader2,
  Calendar,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import Link from "next/link";

const EXAM_OPTIONS = ["All", "IIT JEE", "NEET", "Class 12+", "CBSE Boards"];
const TIMEFRAME_OPTIONS = [
  { id: "all", label: "All-Time" },
  { id: "month", label: "Past 30 Days" },
  { id: "week", label: "This Week" },
] as const;

export function LeaderboardView() {
  const [timeframe, setTimeframe] = useState<"all" | "week" | "month">("all");
  const [examFilter, setExamFilter] = useState("All");
  const [data, setData] = useState<{
    entries: LeaderboardEntry[];
    podium: LeaderboardEntry[];
    currentUserEntry: LeaderboardEntry | null;
    topTrajectories: Array<{
      username: string;
      fullName: string;
      rank: number;
      slope: number;
      velocity: number;
      isCurrentUser: boolean;
      trajectory: TrajectoryPoint[];
    }>;
  }>({
    entries: [],
    podium: [],
    currentUserEntry: null,
    topTrajectories: [],
  });

  const [isPending, startTransition] = useTransition();

  const fetchData = (tf: "all" | "week" | "month", exam: string) => {
    startTransition(async () => {
      try {
        const res = await getLeaderboardDataAction(tf, exam);
        setData(res);
      } catch (err) {
        console.error("Failed to load leaderboard data:", err);
      }
    });
  };

  useEffect(() => {
    fetchData(timeframe, examFilter);
  }, [timeframe, examFilter]);

  // Transform trajectory data for multi-line comparison chart
  // Max concepts covered among top trajectories
  const maxConcepts = Math.max(
    1,
    ...data.topTrajectories.flatMap((t) => t.trajectory.map((p) => p.conceptIndex))
  );

  const chartData: any[] = [];
  for (let c = 1; c <= Math.min(maxConcepts, 30); c++) {
    const row: any = { conceptIndex: c };
    data.topTrajectories.forEach((t) => {
      const pt = t.trajectory.find((p) => p.conceptIndex === c);
      if (pt) {
        row[`${t.username}`] = pt.cumulativeAvg;
      }
    });
    chartData.push(row);
  }

  const trajectoryColors = ["#EAB308", "#94A3B8", "#B45309", "#3B82F6"];

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Hero Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="h-7 w-7 text-yellow-500 animate-pulse" />
            <h1 className="text-3xl font-headline font-bold">Aspirant Mastery Leaderboard</h1>
          </div>
          <p className="text-muted-foreground text-sm max-w-2xl">
            Ranked by <span className="text-primary font-semibold">Learning Velocity</span> (slope of Performance vs. Concepts Covered), daily consistency streak, and Concept Mirror oral defense.
          </p>
        </div>

        {/* Current User Quick Badge */}
        {data.currentUserEntry && (
          <Card className="border-primary/40 bg-primary/5 p-4 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-center justify-center bg-primary/20 text-primary rounded-xl px-3 py-1 font-bold">
                <span className="text-xs uppercase">Your Rank</span>
                <span className="text-2xl font-headline font-extrabold">
                  #{data.currentUserEntry.rank}
                </span>
              </div>
              <div>
                <p className="font-semibold text-sm">@{data.currentUserEntry.username}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                  <span className="flex items-center gap-1 text-orange-500 font-semibold">
                    <Flame className="h-3.5 w-3.5" />
                    {data.currentUserEntry.currentStreak}d Streak
                  </span>
                  <span>•</span>
                  <span>{data.currentUserEntry.conceptsCovered} Concepts</span>
                  <span>•</span>
                  <span className="text-green-500 font-semibold">
                    m = {data.currentUserEntry.slope}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Filter Toolbar */}
      <Card className="bg-card/60 backdrop-blur-sm border shadow-sm">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
          {/* Timeframe selector */}
          <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-lg">
            {TIMEFRAME_OPTIONS.map((tf) => (
              <Button
                key={tf.id}
                variant={timeframe === tf.id ? "default" : "ghost"}
                size="sm"
                className="text-xs h-8 px-3"
                onClick={() => setTimeframe(tf.id)}
              >
                {tf.label}
              </Button>
            ))}
          </div>

          {/* Exam Focus Filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
              <Filter className="h-3.5 w-3.5" /> Exam:
            </span>
            {EXAM_OPTIONS.map((exam) => (
              <Button
                key={exam}
                variant={examFilter === exam ? "secondary" : "outline"}
                size="sm"
                className="text-xs h-7 px-2.5"
                onClick={() => setExamFilter(exam)}
              >
                {exam}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Podium Cards (Rank 1, 2, 3) */}
      {data.podium.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end pt-4">
          {/* Rank 2 (Silver) */}
          {data.podium[1] ? (
            <Card className="relative border-slate-400/50 bg-gradient-to-b from-slate-500/10 to-transparent order-2 md:order-1 shadow-md">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-slate-300 text-slate-900 px-3 py-0.5 rounded-full text-xs font-bold flex items-center gap-1 shadow">
                <Medal className="h-3.5 w-3.5" /> Rank #2
              </div>
              <CardContent className="pt-8 pb-6 text-center space-y-3">
                <h3 className="font-headline font-bold text-lg">
                  {data.podium[1].fullName}
                </h3>
                <p className="text-xs text-primary font-medium">@{data.podium[1].username}</p>
                <Badge variant="outline" className="text-xs">
                  {data.podium[1].examFocus}
                </Badge>
                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border/60">
                  <div className="bg-muted/50 p-2 rounded">
                    <p className="text-muted-foreground">Concepts</p>
                    <p className="font-bold text-sm">{data.podium[1].conceptsCovered}</p>
                  </div>
                  <div className="bg-muted/50 p-2 rounded">
                    <p className="text-muted-foreground">Avg Score</p>
                    <p className="font-bold text-sm">{data.podium[1].avgScore}%</p>
                  </div>
                  <div className="bg-muted/50 p-2 rounded">
                    <p className="text-muted-foreground">Slope (m)</p>
                    <p className="font-bold text-sm text-green-500">+{data.podium[1].slope}</p>
                  </div>
                  <div className="bg-muted/50 p-2 rounded">
                    <p className="text-muted-foreground">Streak</p>
                    <p className="font-bold text-sm text-orange-500">{data.podium[1].currentStreak}d</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="order-2 md:order-1" />
          )}

          {/* Rank 1 (Gold) */}
          {data.podium[0] && (
            <Card className="relative border-yellow-500/60 bg-gradient-to-b from-yellow-500/15 via-yellow-500/5 to-transparent order-1 md:order-2 shadow-xl ring-2 ring-yellow-500/20 scale-105">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-yellow-400 text-yellow-950 px-4 py-1 rounded-full text-xs font-extrabold flex items-center gap-1.5 shadow-lg">
                <Crown className="h-4 w-4 fill-yellow-950" /> Rank #1 Champion
              </div>
              <CardContent className="pt-9 pb-6 text-center space-y-3">
                <h3 className="font-headline font-extrabold text-xl text-yellow-500">
                  {data.podium[0].fullName}
                </h3>
                <p className="text-xs text-primary font-medium">@{data.podium[0].username}</p>
                <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/40 text-xs">
                  {data.podium[0].examFocus}
                </Badge>
                <div className="grid grid-cols-2 gap-2 text-xs pt-3 border-t border-yellow-500/30">
                  <div className="bg-yellow-500/10 p-2 rounded">
                    <p className="text-muted-foreground">Concepts Covered</p>
                    <p className="font-extrabold text-base text-foreground">{data.podium[0].conceptsCovered}</p>
                  </div>
                  <div className="bg-yellow-500/10 p-2 rounded">
                    <p className="text-muted-foreground">Avg Mastery</p>
                    <p className="font-extrabold text-base text-foreground">{data.podium[0].avgScore}%</p>
                  </div>
                  <div className="bg-yellow-500/10 p-2 rounded">
                    <p className="text-muted-foreground">Learning Slope</p>
                    <p className="font-extrabold text-base text-green-500">+{data.podium[0].slope}</p>
                  </div>
                  <div className="bg-yellow-500/10 p-2 rounded">
                    <p className="text-muted-foreground">Active Streak</p>
                    <p className="font-extrabold text-base text-orange-500">{data.podium[0].currentStreak}d 🔥</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Rank 3 (Bronze) */}
          {data.podium[2] ? (
            <Card className="relative border-amber-700/50 bg-gradient-to-b from-amber-700/10 to-transparent order-3 shadow-md">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-amber-600 text-amber-950 px-3 py-0.5 rounded-full text-xs font-bold flex items-center gap-1 shadow">
                <Award className="h-3.5 w-3.5" /> Rank #3
              </div>
              <CardContent className="pt-8 pb-6 text-center space-y-3">
                <h3 className="font-headline font-bold text-lg">
                  {data.podium[2].fullName}
                </h3>
                <p className="text-xs text-primary font-medium">@{data.podium[2].username}</p>
                <Badge variant="outline" className="text-xs">
                  {data.podium[2].examFocus}
                </Badge>
                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border/60">
                  <div className="bg-muted/50 p-2 rounded">
                    <p className="text-muted-foreground">Concepts</p>
                    <p className="font-bold text-sm">{data.podium[2].conceptsCovered}</p>
                  </div>
                  <div className="bg-muted/50 p-2 rounded">
                    <p className="text-muted-foreground">Avg Score</p>
                    <p className="font-bold text-sm">{data.podium[2].avgScore}%</p>
                  </div>
                  <div className="bg-muted/50 p-2 rounded">
                    <p className="text-muted-foreground">Slope (m)</p>
                    <p className="font-bold text-sm text-green-500">+{data.podium[2].slope}</p>
                  </div>
                  <div className="bg-muted/50 p-2 rounded">
                    <p className="text-muted-foreground">Streak</p>
                    <p className="font-bold text-sm text-orange-500">{data.podium[2].currentStreak}d</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="order-3" />
          )}
        </div>
      )}

      {/* Trajectory Comparison Chart */}
      <Card className="border shadow-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-headline flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Learning Trajectory Graph: Concepts Covered ($X$) vs. Performance ($Y$)
              </CardTitle>
              <CardDescription>
                Shows the mastery growth rate for top rankers and your current profile. Steeper slope ($m$) indicates accelerated learning.
              </CardDescription>
            </div>
            {isPending && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
          </div>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <div className="h-[340px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis
                    dataKey="conceptIndex"
                    label={{ value: "Concepts Covered (X)", position: "insideBottom", offset: -10 }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    label={{ value: "Cumulative Score % (Y)", angle: -90, position: "insideLeft" }}
                  />
                  <RechartsTooltip />
                  <Legend verticalAlign="top" height={36} />
                  {data.topTrajectories.map((t, idx) => (
                    <Line
                      key={t.username}
                      type="monotone"
                      dataKey={t.username}
                      name={`#${t.rank} @${t.username} (m=${t.slope})`}
                      stroke={t.isCurrentUser ? "#10B981" : trajectoryColors[idx % trajectoryColors.length]}
                      strokeWidth={t.isCurrentUser ? 3 : 2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 6 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No concept trajectory data available for the selected filters.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full Leaderboard Table */}
      <Card className="border shadow-md overflow-hidden">
        <CardHeader>
          <CardTitle className="text-lg font-headline flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Complete Rankings & Velocity Metrics
          </CardTitle>
          <CardDescription>
            Deterministic ranking: Rank Score &gt; Active Streak &gt; Concepts Mastered &gt; Mirror Defense Duration &gt; Seniority.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/70 text-xs uppercase font-semibold text-muted-foreground border-b">
                <tr>
                  <th className="py-3 px-4">Rank</th>
                  <th className="py-3 px-4">Aspirant</th>
                  <th className="py-3 px-4">Exam Focus</th>
                  <th className="py-3 px-4 text-center">Concepts (X)</th>
                  <th className="py-3 px-4 text-center">Avg Score (Y)</th>
                  <th className="py-3 px-4 text-center">Slope (m)</th>
                  <th className="py-3 px-4 text-center">Streak</th>
                  <th className="py-3 px-4 text-right">Composite Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {data.entries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-muted-foreground">
                      No aspirants found for this view.
                    </td>
                  </tr>
                ) : (
                  data.entries.map((entry) => (
                    <tr
                      key={entry.uuid}
                      className={`hover:bg-muted/40 transition-colors ${
                        entry.isCurrentUser ? "bg-primary/10 font-medium" : ""
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          {entry.rank === 1 && <Crown className="h-4 w-4 text-yellow-500 fill-yellow-500" />}
                          {entry.rank === 2 && <Medal className="h-4 w-4 text-slate-400" />}
                          {entry.rank === 3 && <Award className="h-4 w-4 text-amber-600" />}
                          <span className="font-bold">#{entry.rank}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <Link
                          href={`/profile/${entry.username}`}
                          className="hover:underline flex flex-col"
                        >
                          <span className="font-semibold text-foreground">
                            {entry.fullName}
                            {entry.isCurrentUser && (
                              <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">
                                You
                              </Badge>
                            )}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            @{entry.username} {entry.city ? `• ${entry.city}` : ""}
                          </span>
                        </Link>
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge variant="outline" className="text-xs font-normal">
                          {entry.examFocus}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold">
                        {entry.conceptsCovered}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`font-semibold ${
                            entry.avgScore >= 80
                              ? "text-green-500"
                              : entry.avgScore >= 60
                              ? "text-yellow-500"
                              : "text-muted-foreground"
                          }`}
                        >
                          {entry.avgScore}%
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded ${
                            entry.slope > 0
                              ? "bg-green-500/10 text-green-500"
                              : entry.slope < 0
                              ? "bg-red-500/10 text-red-500"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {entry.slope > 0 ? `+${entry.slope}` : entry.slope}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center gap-1 font-semibold text-orange-500 text-xs">
                          <Flame className="h-3.5 w-3.5" />
                          {entry.currentStreak}d
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-extrabold text-primary">
                        {entry.rankScore}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
