"use client";

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { BookOpen, Calendar, Target, Trophy, BrainCircuit } from 'lucide-react';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#ffc658', '#82ca9d', '#a4de6c'];

type AnalyticsData = {
  totalTopics: number;
  averageScore?: number;
  aggregatedChartsData?: string;
  subjectDistribution: { name: string, value: number }[];
  chapterDistribution: { name: string, value: number }[];
  activityTimeline: { date: string, count: number }[];
  user: any;
};

export function UserAnalytics({ data }: { data: AnalyticsData }) {
  
  const mostStudiedSubject = useMemo(() => {
    if (data.subjectDistribution.length === 0) return "N/A";
    return data.subjectDistribution.reduce((prev, current) => (prev.value > current.value) ? prev : current).name;
  }, [data.subjectDistribution]);

  const aggregatedCharts = useMemo(() => {
    if (!data.aggregatedChartsData) return [];
    try {
      return JSON.parse(data.aggregatedChartsData);
    } catch (e) {
      console.error("Failed to parse aggregated charts data", e);
      return [];
    }
  }, [data.aggregatedChartsData]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        
        <Card className="hover:-translate-y-1 transition-transform border-primary/20 bg-primary/10">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-primary">Avg. Score</CardTitle>
            <BrainCircuit className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-primary">{data.averageScore || 0}%</div>
            <p className="text-xs text-muted-foreground mt-1 font-medium">
              Overall AI performance
            </p>
          </CardContent>
        </Card>

        <Card className="hover:-translate-y-1 transition-transform border-primary/10">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Topics</CardTitle>
            <BookOpen className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalTopics}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Concepts mastered
            </p>
          </CardContent>
        </Card>
        
        <Card className="hover:-translate-y-1 transition-transform">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Most Studied Subject</CardTitle>
            <Trophy className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate">{mostStudiedSubject}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Top subject by volume
            </p>
          </CardContent>
        </Card>
        
        <Card className="hover:-translate-y-1 transition-transform">
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

        <Card className="hover:-translate-y-1 transition-transform">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Last 30 Days</CardTitle>
            <Calendar className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.activityTimeline.reduce((acc, curr) => acc + curr.count, 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Topics generated recently
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Pie Chart: Subject Distribution */}
        <Card className="col-span-1 border-border shadow-sm">
          <CardHeader>
            <CardTitle>Subject Distribution</CardTitle>
            <CardDescription>Breakdown of topics by subject</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {data.subjectDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.subjectDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {data.subjectDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    formatter={(value: number) => [`${value} topics`, 'Count']}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bar Chart: Activity Timeline */}
        <Card className="col-span-1 border-border shadow-sm">
          <CardHeader>
            <CardTitle>Activity Timeline</CardTitle>
            <CardDescription>Topics generated over the last 30 days</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.activityTimeline}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={20}
                />
                <YAxis 
                  allowDecimals={false} 
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                />
                <RechartsTooltip 
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', backgroundColor: 'hsl(var(--background))', color: 'hsl(var(--foreground))' }}
                />
                <Bar 
                  dataKey="count" 
                  fill="hsl(var(--primary))" 
                  radius={[4, 4, 0, 0]}
                  animationDuration={1500}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Histogram / Bar Chart: Top Chapters */}
        <Card className="col-span-1 lg:col-span-2 border-border shadow-sm">
          <CardHeader>
            <CardTitle>Top Chapters Mastered (Histogram)</CardTitle>
            <CardDescription>Distribution of concepts across specific chapters</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
             {data.chapterDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.chapterDistribution} margin={{ top: 20, right: 30, left: 0, bottom: 50 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                    angle={-45}
                    textAnchor="end"
                  />
                  <YAxis 
                    allowDecimals={false} 
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <RechartsTooltip 
                    cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar 
                    dataKey="value" 
                    name="Topics"
                    fill="#8884d8" 
                    radius={[4, 4, 0, 0]}
                    animationDuration={1500}
                  >
                    {data.chapterDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
             ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
             )}
          </CardContent>
        </Card>

        {/* Dynamic Aggregated Charts */}
        {aggregatedCharts.map((chart: any, index: number) => (
          <Card key={`agg-chart-${index}`} className="col-span-1 border-border shadow-sm">
            <CardHeader>
              <CardTitle>{chart.title}</CardTitle>
              <CardDescription>All-time average score across all topics</CardDescription>
            </CardHeader>
            <CardContent>
              {chart.type === 'bar' && chart.config && chart.data?.length > 0 && (
                <ChartContainer config={chart.config} className="min-h-[250px] w-full">
                  <BarChart accessibilityLayer data={chart.data}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)"/>
                    <XAxis dataKey="name" tickLine={false} tickMargin={10} axisLine={false} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
                    <Bar dataKey="score" fill="hsl(var(--primary))" radius={4} />
                  </BarChart>
                </ChartContainer>
              )}
              {chart.type === 'pie' && chart.data?.length > 0 && (
                <ChartContainer config={chart.config || {}} className="mx-auto aspect-square h-[250px]">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
                    <Pie data={chart.data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                       {chart.data.map((entry: any, idx: number) => (
                        <Cell key={`cell-${idx}`} fill={entry.fill || COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              )}
              {chart.type === 'histo' && chart.config && chart.data?.length > 0 && (
                <ChartContainer config={chart.config} className="min-h-[250px] w-full">
                  <BarChart accessibilityLayer data={chart.data} barCategoryGap={0}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)"/>
                    <XAxis dataKey="name" tickLine={false} tickMargin={10} axisLine={false} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
                    <Bar dataKey="score" fill="hsl(var(--primary))" radius={0} />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        ))}

      </div>
    </div>
  );
}
