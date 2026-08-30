"use client";

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { BookOpen, Target, Trophy, BrainCircuit } from 'lucide-react';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#ffc658', '#82ca9d', '#a4de6c'];

type AnalyticsData = {
  totalTopics: number;
  averageScore?: number;
  subjectDistribution: { name: string, value: number }[];
  scoreDistribution: { name: string, value: number }[];
  skillAverages: { name: string, score: number }[];
  user: any;
};

export function UserAnalytics({ data }: { data: AnalyticsData }) {
  
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

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <Card className="hover:-translate-y-1 transition-transform border-primary/20 bg-primary/10">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-primary">Concept Mirror Avg.</CardTitle>
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
      </div>

      {/* 3 Perfect Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Chart 1: Pie Chart - Subject Distribution */}
        <Card className="col-span-1 border-border shadow-sm flex flex-col">
          <CardHeader>
            <CardTitle>Subject Distribution (Pie)</CardTitle>
            <CardDescription>Topics breakdown from Concept Nichod</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[350px]">
            {data.subjectDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.subjectDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={120}
                    paddingAngle={3}
                    dataKey="value"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {data.subjectDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    formatter={(value: number) => [`${value} topics`, 'Count']}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', backgroundColor: 'hsl(var(--background))', color: 'hsl(var(--foreground))' }}
                  />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                No data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chart 2: Histogram - Score Distribution */}
        <Card className="col-span-1 border-border shadow-sm flex flex-col">
          <CardHeader>
            <CardTitle>Overall Score Distribution (Histogram)</CardTitle>
            <CardDescription>Distribution of performance scores from Concept Mirror</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[350px]">
             {data.scoreDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.scoreDistribution} margin={{ top: 20, right: 30, left: 0, bottom: 5 }} barCategoryGap={0}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
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
                    dataKey="value" 
                    name="Topics"
                    fill="#10b981" 
                    radius={0}
                    animationDuration={1500}
                  />
                </BarChart>
              </ResponsiveContainer>
             ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
             )}
          </CardContent>
        </Card>

        {/* Chart 3: Bar Chart - Skill Averages */}
        <Card className="col-span-1 lg:col-span-2 border-border shadow-sm flex flex-col">
          <CardHeader>
            <CardTitle>Average Skill Performance (Bar)</CardTitle>
            <CardDescription>Combined AI evaluations from Concept Mirror practice sessions</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[400px]">
             {data.skillAverages.length > 0 ? (
                <ChartContainer config={chartConfig} className="w-full h-full">
                  <BarChart accessibilityLayer data={data.skillAverages} margin={{ top: 20, right: 30, left: 0, bottom: 50 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)"/>
                    <XAxis 
                        dataKey="name" 
                        tickLine={false} 
                        tickMargin={10} 
                        axisLine={false} 
                        angle={-45}
                        textAnchor="end"
                    />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
                    <Bar 
                        dataKey="score" 
                        fill="hsl(var(--primary))" 
                        radius={[4, 4, 0, 0]} 
                        animationDuration={1500}
                    />
                  </BarChart>
                </ChartContainer>
             ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
             )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
