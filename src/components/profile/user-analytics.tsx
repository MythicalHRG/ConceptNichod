"use client";

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area
} from 'recharts';
import { 
  BookOpen, Target, Trophy, BrainCircuit, TrendingUp, Layers, BarChart2, 
  PieChart as PieIcon, Mic, Clock, Sparkles, Award, ArrowUpRight 
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

export function UserAnalytics({ data }: { data: AnalyticsData }) {
  const isMythical = data.user?.username?.toLowerCase() === "mythicalhrg";
  
  const mostStudiedSubject = useMemo(() => {
    if (data.subjectDistribution.length === 0) return "N/A";
    return data.subjectDistribution.reduce((prev, current) => (prev.value > current.value) ? prev : current).name;
  }, [data.subjectDistribution]);

  // Chart configuration for shadcn/ui charts (used for the Bar chart)
  const chartConfig = {
    score: {
      label: "Average Score",
      color: "hsl(var(--primary))",
    },
  };

  const progressionData = useMemo(() => {
    if (data.learningProgression && data.learningProgression.length > 0) {
      return data.learningProgression;
    }
    return [];
  }, [data.learningProgression]);

  const mirrorData = data.conceptMirror || {
    totalSessions: 0,
    averageScore: 0,
    totalDurationSeconds: 0,
    skillAverages: [],
    recentSessions: [],
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        
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

        {/* Card 2: Concept Nichod Generated */}
        <Card className="hover:-translate-y-1 transition-transform border-primary/10">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Concept Nichod Generated</CardTitle>
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
            <div className="text-2xl font-bold">{data.user.classLevel || "N/A"}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.user.examFocus ? `Targeting ${data.user.examFocus}` : "Academic Level"}
            </p>
          </CardContent>
        </Card>
      </div>

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
        <CardContent className="p-6 space-y-6">
          {/* Key Oral Defense Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border bg-card/60 flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                <BrainCircuit className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Oral Sessions</p>
                <p className="text-xl font-extrabold">{mirrorData.totalSessions}</p>
              </div>
            </div>

            <div className="p-4 rounded-xl border bg-card/60 flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Average Oral Score</p>
                <p className="text-xl font-extrabold text-emerald-500">{mirrorData.averageScore}%</p>
              </div>
            </div>

            <div className="p-4 rounded-xl border bg-card/60 flex items-center gap-3">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {mirrorData.skillAverages.map((skill) => (
                  <div key={skill.name} className="p-3 rounded-lg border bg-background flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">{skill.name}</span>
                    <Badge variant="outline" className={`font-mono text-xs font-bold ${
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
                    className="p-3 rounded-lg border bg-background/50 hover:bg-muted/30 transition-colors flex items-center justify-between gap-3"
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

      {/* 4 Distinct Non-Repeating Chart Types */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Chart 1: Pie / Donut Chart - Subject Distribution */}
        <Card className="col-span-1 border-border shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <PieIcon className="w-4 h-4 text-emerald-500" /> Subject Distribution
              </CardTitle>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground">Pie / Donut</span>
            </div>
            <CardDescription className="text-xs">Topics breakdown from Concept Nichod</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[300px] flex items-center justify-center">
            {data.subjectDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={data.subjectDistribution}
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
                    {data.subjectDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    formatter={(value: number) => [`${value} topics`, 'Count']}
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--background))', color: 'hsl(var(--foreground))' }}
                  />
                  <Legend verticalAlign="bottom" height={32}/>
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
        <Card className="col-span-1 border-border shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-500" /> Overall Score Distribution
              </CardTitle>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground">Histogram</span>
            </div>
            <CardDescription className="text-xs">Frequency distribution of practice performance</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[300px]">
             {data.scoreDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.scoreDistribution} margin={{ top: 20, right: 20, left: -10, bottom: 5 }} barCategoryGap={2}>
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
        <Card className="col-span-1 border-border shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-primary" /> Average Skill Performance
              </CardTitle>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground">Bar</span>
            </div>
            <CardDescription className="text-xs">Discrete evaluations across core competencies</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[300px]">
             {data.skillAverages.length > 0 ? (
                <ChartContainer config={chartConfig} className="w-full h-[280px]">
                  <BarChart accessibilityLayer data={data.skillAverages} margin={{ top: 20, right: 20, left: -10, bottom: 25 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)"/>
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

        {/* Chart 4: Polynomial Spline Area Chart - Mastery Trajectory Curve */}
        <Card className="col-span-1 border-border shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-500" /> Mastery Learning Curve
              </CardTitle>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground">Polynomial Spline</span>
            </div>
            <CardDescription className="text-xs">Continuous progress curve over assessment sessions</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[300px]">
            {progressionData.length > 0 ? (
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
                    type="monotone" 
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

      </div>
    </div>
  );
}
