"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import {
  BookOpen, Target, Trophy, BrainCircuit, TrendingUp, Layers, BarChart2,
  PieChart as PieIcon, Mic, Clock, Sparkles, Award, ArrowUpRight, Compass
} from 'lucide-react';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import Link from 'next/link';
import { cn } from "@/lib/utils";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#ffc658', '#82ca9d', '#a4de6c'];

export type ConceptMirrorSession = {
  id: string;
  conceptName: string;
  overallScore: number;
  durationSeconds: number;
  createdAt: Date | string;
};

export type AnalyticsData = {
  totalTopics: number;
  averageScore?: number;
  subjectDistribution: { name: string; value: number }[];
  scoreDistribution: { name: string; value: number }[];
  skillAverages: { name: string; score: number }[];
  learningProgression?: { session: string; score: number }[];
  conceptMirror?: {
    totalSessions: number;
    averageScore: number;
    totalDurationSeconds: number;
    skillAverages: { name: string; score: number }[];
    recentSessions: ConceptMirrorSession[];
  };
  user: any;
};

function clampScore(val: unknown): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

/**
 * Always builds a crisp 5-axis BGMI-style Pentagon Radar dataset for any profile
 * (never collapses into a 1D straight line, and remains visible even for newer users).
 */
function buildProfilePentagonData(
  data: AnalyticsData,
  mirrorData: NonNullable<AnalyticsData["conceptMirror"]>
): Array<{ metric: string; score: number }> {
  const measured: Array<{ metric: string; score: number }> = [];
  const seen = new Set<string>();

  const pushMetric = (rawName: string, rawScore: number) => {
    const clean = (rawName || "").trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key) || measured.length >= 5) return;
    if (!Number.isFinite(rawScore)) return;
    seen.add(key);
    measured.push({
      metric: clean.length > 16 ? clean.slice(0, 14) + "…" : clean,
      score: clampScore(rawScore),
    });
  };

  // Prefer measured dimensions from completed oral and written assessments.
  for (const skill of Array.isArray(mirrorData.skillAverages) ? mirrorData.skillAverages : []) {
    pushMetric(skill.name, skill.score);
  }
  for (const skill of Array.isArray(data.skillAverages) ? data.skillAverages : []) {
    pushMetric(skill.name, skill.score);
  }

  // If a detailed skill breakdown is unavailable, use actual assessment averages.
  // Session counts are never converted into invented performance scores.
  const hasWrittenScores = Array.isArray(data.scoreDistribution) &&
    data.scoreDistribution.some((bucket) => Number.isFinite(bucket.value) && bucket.value > 0);
  if (hasWrittenScores) pushMetric("Written Average", data.averageScore ?? 0);
  if (mirrorData.totalSessions > 0) pushMetric("Oral Average", mirrorData.averageScore ?? 0);

  return measured;
}

export function UserAnalytics({ data }: { data: AnalyticsData }) {
  const [hasMounted, setHasMounted] = useState(false);
  const isMythical = data.user?.username?.toLowerCase() === "mythicalhrg";

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const subjectDistribution = Array.isArray(data.subjectDistribution) ? data.subjectDistribution : [];
  const scoreDistribution = Array.isArray(data.scoreDistribution) ? data.scoreDistribution : [];
  const skillAverages = Array.isArray(data.skillAverages) ? data.skillAverages : [];

  const mostStudiedSubject = useMemo(() => {
    if (subjectDistribution.length === 0) return "N/A";
    return subjectDistribution.reduce((prev, current) => (prev.value > current.value) ? prev : current).name;
  }, [subjectDistribution]);

  const chartConfig = {
    score: {
      label: "Average Score",
      color: "hsl(var(--primary))",
    },
  };

  const progressionData = useMemo(() => {
    if (Array.isArray(data.learningProgression) && data.learningProgression.length > 0) {
      return data.learningProgression;
    }
    return [];
  }, [data.learningProgression]);

  const mirrorData = useMemo(
    () =>
      data.conceptMirror || {
        totalSessions: 0,
        averageScore: 0,
        totalDurationSeconds: 0,
        skillAverages: [],
        recentSessions: [],
      },
    [data.conceptMirror]
  );

  const pentagonData = useMemo(
    () => buildProfilePentagonData(data, mirrorData),
    [data, mirrorData]
  );

  const hasRadarData = pentagonData.length > 0;

  const formatDuration = (seconds: number) => {
    const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="space-y-8 min-w-0 max-w-full overflow-x-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">

        {/* Card 1: Concept Mirror Oral Defense */}
        <Card className={cn(
          "hover:-translate-y-1 transition-transform",
          isMythical
            ? "border-amber-500/30 bg-amber-500/10"
            : "border-primary/20 bg-primary/10"
        )}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-primary">Concept Mirror Mastery</CardTitle>
            <BrainCircuit className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-primary">
              {mirrorData.totalSessions > 0
                ? `${mirrorData.averageScore}%`
                : data.averageScore
                ? `${data.averageScore}%`
                : '0%'}
            </div>
            <p className="text-xs text-muted-foreground mt-1 font-medium">
              {mirrorData.totalSessions > 0
                ? `${mirrorData.totalSessions} oral defense sessions`
                : 'Verbal delivery & clarity'}
            </p>
          </CardContent>
        </Card>

        {/* Card 2: ConceptNichod Generated */}
        <Card className="hover:-translate-y-1 transition-transform border-primary/10">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">ConceptNichod Generated</CardTitle>
            <BookOpen className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalTopics}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Concepts explored
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Written Practice Avg */}
        <Card className="hover:-translate-y-1 transition-transform border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Written Practice Score</CardTitle>
            <Trophy className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.averageScore || 0}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {mostStudiedSubject !== "N/A" ? `Top: ${mostStudiedSubject}` : 'Topic practice assessments'}
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Class / Grade */}
        <Card className="hover:-translate-y-1 transition-transform border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Class / Grade</CardTitle>
            <Target className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.user?.classLevel || "N/A"}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.user?.examFocus ? `Targeting ${data.user.examFocus}` : "Academic Level"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Concept Mirror Oral Defense summary follows the KPI strip. */}
      {/* Concept Mirror Dedicated Analytics Section */}
      <Card className="border-border shadow-sm overflow-hidden">
        <CardHeader className="pb-3 border-b bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Mic className="w-5 h-5 text-primary" />
                Concept Mirror: Oral Defense & Verbal Analytics
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Evaluations of verbal concept explanations, conceptual rigor, and oral delivery.
              </CardDescription>
            </div>
            <Link
              href="/dashboard/concept-mirror"
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 shrink-0 self-start sm:self-auto"
            >
              Open Concept Mirror <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-5 space-y-4">
          {/* Key Oral Defense Metrics */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-4 p-4 rounded-xl border bg-card/60 flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                <BrainCircuit className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Oral Sessions</p>
                <p className="text-xl font-extrabold">{mirrorData.totalSessions}</p>
              </div>
            </div>

            <div className="lg:col-span-4 p-4 rounded-xl border bg-card/60 flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Average Oral Score</p>
                <p className="text-xl font-extrabold text-emerald-500">{mirrorData.averageScore}%</p>
              </div>
            </div>

            <div className="lg:col-span-4 p-4 rounded-xl border bg-card/60 flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-500">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Time Explaining</p>
                <p className="text-xl font-extrabold">{formatDuration(mirrorData.totalDurationSeconds)}</p>
              </div>
            </div>
          </div>

          {/* Skill Breakdown or Recent Sessions */}
          {mirrorData.skillAverages.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Verbal Competency Breakdown
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {mirrorData.skillAverages.map((skill) => (
                  <div key={skill.name} className="p-3 rounded-lg border bg-background flex items-center justify-between gap-2 min-w-0">
                    <span className="text-xs font-medium text-foreground truncate">{skill.name}</span>
                    <Badge variant="outline" className={`font-mono text-xs font-bold shrink-0 ${
                      skill.score >= 80 ? 'text-emerald-500 border-emerald-500/30' :
                      skill.score >= 60 ? 'text-amber-500 border-amber-500/30' : 'text-red-500 border-red-500/30'
                    }`}>
                      {skill.score}%
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Mirrored Concepts */}
          {mirrorData.recentSessions.length > 0 ? (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Recent Oral Defenses
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {mirrorData.recentSessions.map((session, idx) => (
                  <div
                    key={session.id || idx}
                    className="p-3 rounded-lg border bg-background/50 hover:bg-muted/30 transition-colors flex items-center justify-between gap-3 min-w-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate text-foreground">{session.conceptName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {session.durationSeconds > 0 ? formatDuration(session.durationSeconds) : 'Oral explanation'} • {new Date(session.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge className={`font-mono font-bold text-xs shrink-0 ${
                      session.overallScore >= 80 ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' :
                      session.overallScore >= 60 ? 'bg-amber-500/15 text-amber-500 border-amber-500/30' : 'bg-red-500/15 text-red-500 border-red-500/30'
                    }`}>
                      {session.overallScore}%
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-6 rounded-xl border border-dashed text-center space-y-2 bg-muted/10">
              <Sparkles className="w-6 h-6 text-primary mx-auto opacity-80" />
              <p className="text-sm font-medium text-foreground">No oral defense sessions recorded yet</p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Speak your understanding in Concept Mirror to unlock multi-dimensional verbal clarity scores and fluency analytics.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Unified five-graph desktop bento grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4 sm:gap-5 items-stretch">
      {/* Always-Visible BGMI-Style 5-Axis Pentagon Skill Radar Graph */}
      <Card className="md:col-span-2 xl:col-span-3 min-w-0 overflow-hidden border-amber-500/25 bg-gradient-to-br from-card via-card to-primary/5 shadow-sm">
        <CardHeader className="pb-2 border-b border-border/60 bg-muted/15">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                <Compass className="w-5 h-5 text-amber-500 shrink-0" />
                <span>Verified Mastery Dimensions</span>
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {hasRadarData
                  ? "Measured skill scores from completed written assessments and Concept Mirror sessions."
                  : "Complete a scored practice test or Concept Mirror session to populate measured performance metrics."}
              </CardDescription>
            </div>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30 shrink-0">
              Pentagon Web
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-3 items-center">
          <div className="w-full h-[250px] sm:h-[270px] flex items-center justify-center">
            {hasMounted && hasRadarData ? (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart
                  cx="50%"
                  cy="50%"
                  outerRadius="70%"
                  margin={{ top: 16, right: 32, bottom: 16, left: 32 }}
                  data={pentagonData}
                >
                  <defs>
                    <linearGradient id="profileBgmiPentagon" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.62} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.22} />
                    </linearGradient>
                  </defs>
                  <PolarGrid
                    gridType="polygon"
                    stroke="hsl(var(--border))"
                    strokeOpacity={0.8}
                  />
                  <PolarAngleAxis
                    dataKey="metric"
                    tick={{ fill: "currentColor", fontSize: 11, fontWeight: 600 }}
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 100]}
                    tickCount={6}
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
                    axisLine={false}
                  />
                  <Radar
                    name="Profile Mastery"
                    dataKey="score"
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                    fill="url(#profileBgmiPentagon)"
                    fillOpacity={1}
                    dot={{ r: 4, fill: "#f59e0b", stroke: "hsl(var(--background))", strokeWidth: 1.5 }}
                    activeDot={{ r: 5.5, fill: "hsl(var(--primary))" }}
                  />
                  <RechartsTooltip
                    formatter={(val: number) => [`${val}/100`, "Mastery"]}
                    contentStyle={{
                      borderRadius: "10px",
                      border: "1px solid hsl(var(--border))",
                      backgroundColor: "hsl(var(--background))",
                      color: "hsl(var(--foreground))",
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="px-4 text-center text-sm text-muted-foreground">
                No measured performance dimensions are available yet.
              </div>
            )}
          </div>

          {/* 5-Axis Stat Pills */}
          <div className="grid grid-cols-2 xl:grid-cols-5 gap-2 pt-2 md:pt-0 xl:pt-2 border-t md:border-t-0 xl:border-t border-border/50">
            {pentagonData.map((axis) => (
              <div
                key={axis.metric}
                className="px-3 py-2 rounded-xl border border-border/70 bg-background/70 flex items-center justify-between sm:flex-col sm:items-center sm:justify-center gap-0.5 text-center"
              >
                <span className="text-[11px] text-muted-foreground font-medium truncate max-w-full">
                  {axis.metric}
                </span>
                <span className="text-sm font-extrabold font-mono text-amber-500">
                  {axis.score}
                  <span className="text-[10px] text-muted-foreground font-normal">/100</span>
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Chart 4: Polynomial Spline Area Chart - Mastery Trajectory Curve */}
        <Card className="md:col-span-1 xl:col-span-3 min-w-0 overflow-hidden border-border shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-500" /> Mastery Learning Curve
              </CardTitle>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground">Polynomial Spline</span>
            </div>
            <CardDescription className="text-xs">Continuous progress curve over assessment sessions</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[260px] sm:min-h-[280px]">
            {hasMounted && progressionData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={progressionData} margin={{ top: 20, right: 20, left: -10, bottom: 25 }}>
                  <defs>
                    <linearGradient id="profilePolyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.5)" />
                  <XAxis
                    dataKey="session"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fill: 'currentColor' }}
                    tickMargin={10}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: 'currentColor' }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <RechartsTooltip
                    formatter={(val: number) => [`${val}%`, 'Mastery Score']}
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--background))', color: 'hsl(var(--foreground))' }}
                  />
                  <Area
                    type="natural"
                    dataKey="score"
                    stroke="#6366f1"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#profilePolyGrad)"
                    dot={{ r: 4, fill: "#6366f1", stroke: "hsl(var(--background))", strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                No assessment history available yet
              </div>
            )}
          </CardContent>
        </Card>






        {/* Chart 1: Pie / Donut Chart - Subject Distribution */}
        <Card className="md:col-span-1 xl:col-span-2 min-w-0 overflow-hidden border-border shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <PieIcon className="w-4 h-4 text-emerald-500" /> Subject Distribution
              </CardTitle>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground">Pie / Donut</span>
            </div>
            <CardDescription className="text-xs">Topics breakdown from ConceptNichod</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[250px] flex items-center justify-center">
            {hasMounted && subjectDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={subjectDistribution}
                    cx="50%"
                    cy="48%"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={3}
                    dataKey="value"
                    labelLine={true}
                    label={({ name, percent }) => {
                      if (!percent || percent < 0.05) return null;
                      return `${name} ${(percent * 100).toFixed(0)}%`;
                    }}
                  >
                    {subjectDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value: number) => [`${value} topics`, 'Count']}
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--background))', color: 'hsl(var(--foreground))' }}
                  />
                  <Legend verticalAlign="bottom" height={32} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                No topic data available yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chart 2: Histogram - Score Distribution */}
        <Card className="md:col-span-1 xl:col-span-2 min-w-0 overflow-hidden border-border shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-500" /> Overall Score Distribution
              </CardTitle>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground">Histogram</span>
            </div>
            <CardDescription className="text-xs">Frequency distribution of practice performance</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[250px]">
            {hasMounted && scoreDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={scoreDistribution} margin={{ top: 20, right: 20, left: -10, bottom: 5 }} barCategoryGap={2}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.5)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: 'currentColor' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: 'currentColor' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <RechartsTooltip
                    cursor={{ fill: 'transparent', stroke: 'none' }}
                    formatter={(val: number) => [`${val} sessions`, 'Frequency']}
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--background))', color: 'hsl(var(--foreground))' }}
                  />
                  <Bar
                    dataKey="value"
                    name="Topics"
                    fill="#10b981"
                    radius={[3, 3, 0, 0]}
                    animationDuration={1000}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                No score distribution available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chart 3: Bar Chart - Skill Averages */}
        <Card className="md:col-span-1 xl:col-span-2 min-w-0 overflow-hidden border-border shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-primary" /> Average Skill Performance
              </CardTitle>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground">Bar</span>
            </div>
            <CardDescription className="text-xs">Discrete evaluations across core competencies</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[250px]">
            {hasMounted && skillAverages.length > 0 ? (
              <ChartContainer config={chartConfig} className="w-full h-[250px]">
                <BarChart accessibilityLayer data={skillAverages} margin={{ top: 20, right: 20, left: -10, bottom: 25 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                    tick={{ fontSize: 10, fill: 'currentColor' }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: 'currentColor' }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <ChartTooltip cursor={{ fill: 'transparent', stroke: 'none' }} content={<ChartTooltipContent indicator="dot" />} />
                  <Bar
                    dataKey="score"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                    animationDuration={1000}
                  />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                No skill metrics available
              </div>
            )}
          </CardContent>
        </Card>

        </div>

    </div>
  );
}
