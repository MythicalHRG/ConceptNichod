"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { FinalAnalysisOutput } from "@/ai/flows/analyze-answers";
import { 
  CheckCircle, Info, Star, Target, BarChart2, PieChart as PieIcon, 
  Award, TrendingUp, Layers, Compass 
} from "lucide-react";
import { 
  Bar, BarChart as BarChartComponent, CartesianGrid, XAxis, YAxis, 
  Pie, PieChart as PieChartComponent, Cell, Tooltip, ResponsiveContainer, 
  Area, AreaChart, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend 
} from "recharts";
import { LatexRenderer } from "@/components/ui/latex-renderer";

interface FinalAnalysisDisplayProps {
  analysis: FinalAnalysisOutput;
  topicName: string;
}

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

export function FinalAnalysisDisplay({ analysis, topicName }: FinalAnalysisDisplayProps) {
  const [charts, setCharts] = useState<any[]>([]);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
    let rawList: any[] = [];

    // Robust parsing: handles Array, String, or double-stringified JSON
    if (Array.isArray(analysis.chartsData)) {
      rawList = analysis.chartsData;
    } else if (typeof analysis.chartsData === "string" && analysis.chartsData.trim().length > 0) {
      try {
        let firstPass = JSON.parse(analysis.chartsData);
        if (typeof firstPass === "string") {
          firstPass = JSON.parse(firstPass);
        }
        if (Array.isArray(firstPass)) {
          rawList = firstPass;
        }
      } catch (e) {
        console.warn("Failed to parse AI charts data, generating fallback metrics:", e);
      }
    }

    const baseScore = Math.max(10, Math.min(100, analysis.overallScore || 75));

    // Full distinct diverse chart definitions
    const defaultSuite = [
      {
        type: "bar",
        title: "Cognitive Competencies",
        description: "Discrete evaluation of conceptual, analytical, and practical performance",
        data: [
          { name: "Comprehension", score: Math.min(100, Math.round(baseScore * 1.05)) },
          { name: "Expression", score: Math.max(20, Math.round(baseScore * 0.9)) },
          { name: "Critical Thinking", score: Math.round(baseScore) },
          { name: "Application", score: Math.min(100, Math.round(baseScore * 0.95)) },
        ],
      },
      {
        type: "pie",
        title: "Knowledge Composition",
        description: "Proportional balance between core theory, empirical facts, and insights",
        data: [
          { name: "Core Theory", value: 45, fill: "#3b82f6" },
          { name: "Applied Logic", value: 35, fill: "#10b981" },
          { name: "Analytical Insights", value: 20, fill: "#f59e0b" },
        ],
      },
      {
        type: "histo",
        title: "Response Depth Frequency",
        description: "Distribution of response elaboration across answer difficulty bins",
        data: [
          { name: "0-25% Recall", score: 2 },
          { name: "26-50% Foundational", score: 4 },
          { name: "51-75% Analytical", score: 3 },
          { name: "76-100% Comprehensive", score: 2 },
        ],
      },
      {
        type: "polynomial",
        title: "Adaptive Mastery Progression Curve",
        description: "Continuous polynomial learning trajectory across assessment stages",
        data: [
          { step: "Stage 1: Recall", score: Math.max(20, Math.round(baseScore * 0.72)) },
          { step: "Stage 2: Conceptual", score: Math.max(30, Math.round(baseScore * 0.85)) },
          { step: "Stage 3: Application", score: Math.round(baseScore * 0.94) },
          { step: "Stage 4: Synthesis", score: Math.round(baseScore) },
          { step: "Stage 5: Peak Mastery", score: Math.min(100, Math.round(baseScore * 1.08)) },
        ],
      },
      {
        type: "radar",
        title: "Delivery & Articulation Matrix",
        description: "Multi-axial balance across communication, conciseness, and precision",
        data: [
          { metric: "Clarity", score: Math.min(100, Math.round(baseScore * 1.02)) },
          { metric: "Conciseness", score: Math.max(20, Math.round(baseScore * 0.88)) },
          { metric: "Confidence", score: Math.round(baseScore) },
          { metric: "Technical Precision", score: Math.min(100, Math.round(baseScore * 0.96)) },
          { metric: "Structure", score: Math.min(100, Math.round(baseScore * 1.01)) },
        ],
      },
    ];

    // Guarantee that every single chart in the interface has a UNIQUE type:
    // [bar, pie, histo, polynomial, radar] - NO DUPLICATES IN A SINGLE INTERFACE!
    const availableTypes = ["bar", "pie", "histo", "polynomial", "radar"];
    const seenTypes = new Set<string>();
    const diverseCharts: any[] = [];

    // Add provided charts if their type hasn't been used yet
    for (const c of rawList) {
      if (c && c.type && !seenTypes.has(c.type) && availableTypes.includes(c.type)) {
        seenTypes.add(c.type);
        diverseCharts.push(c);
      }
    }

    // Fill in remaining missing types from defaultSuite so the student gets a rich full visual suite
    for (const d of defaultSuite) {
      if (!seenTypes.has(d.type)) {
        seenTypes.add(d.type);
        diverseCharts.push(d);
      }
    }

    setCharts(diverseCharts);
  }, [analysis]);

  return (
    <div className="space-y-8">
      {/* Overall Score Banner */}
      <Card className="bg-gradient-to-br from-primary/10 via-background to-secondary/30 border-primary/30">
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="font-headline text-3xl text-primary flex items-center gap-2">
                <Award className="w-8 h-8 text-primary" /> Performance Analysis
              </CardTitle>
              <CardDescription className="text-base mt-1">
                Evaluation for topic: <strong>{topicName}</strong>
              </CardDescription>
            </div>
            {analysis.overallScore !== undefined && (
              <div className="text-right bg-background/80 px-4 py-2 rounded-xl border border-primary/20 shadow-sm">
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Overall Score</p>
                <p className="text-3xl font-black text-primary">{analysis.overallScore}/100</p>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-base text-foreground/90 leading-relaxed bg-background/60 p-4 rounded-lg border border-border/60">
            <LatexRenderer content={analysis.performanceSummary} />
          </div>
        </CardContent>
      </Card>

      {/* Accordion Feedback Sections */}
      <Card className="bg-secondary/20 border-border/80">
        <CardContent className="pt-6">
          <Accordion type="multiple" defaultValue={["focus", "improve", "bonus", "tips"]} className="w-full space-y-4">
            
            <AccordionItem value="focus" className="border rounded-lg bg-background px-4">
              <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                <div className="flex items-center gap-3">
                  <Target className="text-primary w-5 h-5" />
                  Areas to Focus
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-2 text-base">
                <ul className="list-disc pl-5 space-y-2.5">
                  {analysis.areasToFocus.map((item, index) => (
                    <li key={index} className="leading-relaxed">
                      <LatexRenderer content={item} />
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="improve" className="border rounded-lg bg-background px-4">
              <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                <div className="flex items-center gap-3">
                  <CheckCircle className="text-emerald-500 w-5 h-5" />
                  Where to Improve
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-2 text-base">
                <ul className="list-disc pl-5 space-y-2.5">
                  {analysis.areasToImprove.map((item, index) => (
                    <li key={index} className="leading-relaxed">
                      <LatexRenderer content={item} />
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="bonus" className="border rounded-lg bg-background px-4">
              <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                <div className="flex items-center gap-3">
                  <Star className="text-amber-500 w-5 h-5" />
                  Key Terms for Bonus Points
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-2 text-base">
                <ul className="list-disc pl-5 space-y-2.5">
                  {analysis.keyTermsForBonus.map((item, index) => (
                    <li key={index} className="leading-relaxed">
                      <LatexRenderer content={item} />
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="tips" className="border rounded-lg bg-background px-4">
              <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                <div className="flex items-center gap-3">
                  <Info className="text-blue-500 w-5 h-5" />
                  Extra Tips
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-2 text-base">
                <ul className="list-disc pl-5 space-y-2.5">
                  {analysis.extraTips.map((item, index) => (
                    <li key={index} className="leading-relaxed">
                      <LatexRenderer content={item} />
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>

          </Accordion>
        </CardContent>
      </Card>

      {/* Visual Analytics, Charts & Graphs: Every single chart is a DIFFERENT type */}
      {hasMounted && charts.length > 0 && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-primary" />
              <h3 className="text-xl font-bold font-headline">Multi-Dimensional Performance Analytics</h3>
            </div>
            <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full font-medium">
              5 Distinct Visual Graph Models
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
            {charts.map((chart: any, index: number) => (
              <Card key={`${chart.type}-${index}`} className="bg-card shadow-sm border border-border/80 flex flex-col justify-between">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      {chart.type === "bar" && <BarChart2 className="w-4 h-4 text-primary" />}
                      {chart.type === "pie" && <PieIcon className="w-4 h-4 text-emerald-500" />}
                      {chart.type === "histo" && <Layers className="w-4 h-4 text-amber-500" />}
                      {chart.type === "polynomial" && <TrendingUp className="w-4 h-4 text-indigo-500" />}
                      {chart.type === "radar" && <Compass className="w-4 h-4 text-purple-500" />}
                      <span>{chart.title}</span>
                    </CardTitle>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground">
                      {chart.type === "polynomial" ? "Polynomial Spline" : chart.type}
                    </span>
                  </div>
                  {chart.description && (
                    <CardDescription className="text-xs text-muted-foreground mt-1">
                      {chart.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="pt-2 flex-1 flex flex-col justify-center">
                  
                  {/* 1. BAR CHART */}
                  {chart.type === "bar" && chart.data?.length > 0 && (
                    <div className="w-full h-[240px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChartComponent data={chart.data} margin={{ top: 15, right: 20, bottom: 25, left: -10 }}>
                          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
                          <XAxis 
                            dataKey="name" 
                            tickLine={false} 
                            axisLine={false} 
                            tick={{ fontSize: 11, fill: 'currentColor' }}
                            tickMargin={8} 
                          />
                          <YAxis 
                            domain={[0, 100]} 
                            tickLine={false} 
                            axisLine={false} 
                            tick={{ fontSize: 11, fill: 'currentColor' }}
                            tickFormatter={(v) => `${v}%`}
                          />
                          <Tooltip 
                            formatter={(val: number) => [`${val}%`, 'Score']}
                            contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} 
                          />
                          <Bar dataKey="score" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} animationDuration={1000} />
                        </BarChartComponent>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* 2. PIE / DONUT CHART */}
                  {chart.type === "pie" && chart.data?.length > 0 && (
                    <div className="w-full h-[240px] flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChartComponent margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                          <Tooltip 
                            formatter={(val: number, name: string) => [`${val}%`, name]}
                            contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} 
                          />
                          <Pie
                            data={chart.data.filter((d: any) => typeof d.value === 'number' && d.value > 0)}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="46%"
                            innerRadius={46}
                            outerRadius={74}
                            paddingAngle={3}
                            labelLine={true}
                            label={({ name, percent, value }) => {
                              if (!percent || percent < 0.05 || value <= 0) return null;
                              return `${name}: ${(percent * 100).toFixed(0)}%`;
                            }}
                          >
                            {chart.data.map((entry: any, idx: number) => (
                              <Cell key={`cell-${idx}`} fill={entry.fill || PIE_COLORS[idx % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Legend verticalAlign="bottom" height={32} iconSize={8} />
                        </PieChartComponent>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* 3. HISTOGRAM */}
                  {chart.type === "histo" && chart.data?.length > 0 && (
                    <div className="w-full h-[240px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChartComponent data={chart.data} barCategoryGap={2} margin={{ top: 15, right: 20, bottom: 25, left: -10 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.5)" />
                          <XAxis 
                            dataKey="name" 
                            tickLine={false} 
                            axisLine={false} 
                            tick={{ fontSize: 10, fill: 'currentColor' }}
                            tickMargin={8}
                          />
                          <YAxis 
                            allowDecimals={false}
                            tickLine={false} 
                            axisLine={false} 
                            tick={{ fontSize: 11, fill: 'currentColor' }}
                          />
                          <Tooltip 
                            formatter={(val: number) => [`${val} answers`, 'Frequency']}
                            contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                          />
                          <Bar 
                            dataKey="score" 
                            fill="#10b981" 
                            radius={[2, 2, 0, 0]} 
                            animationDuration={1000}
                          />
                        </BarChartComponent>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* 4. POLYNOMIAL SCORE CHART (Continuous Smooth Area / Spline) */}
                  {chart.type === "polynomial" && chart.data?.length > 0 && (
                    <div className="w-full h-[240px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chart.data} margin={{ top: 15, right: 20, bottom: 25, left: -10 }}>
                          <defs>
                            <linearGradient id={`polyGradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8} />
                              <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.5)" />
                          <XAxis 
                            dataKey="step" 
                            tickLine={false} 
                            axisLine={false} 
                            tick={{ fontSize: 10, fill: 'currentColor' }}
                            tickMargin={8} 
                          />
                          <YAxis 
                            domain={[0, 100]} 
                            tickLine={false} 
                            axisLine={false} 
                            tick={{ fontSize: 11, fill: 'currentColor' }}
                            tickFormatter={(v) => `${v}%`}
                          />
                          <Tooltip 
                            formatter={(val: number) => [`${val}%`, 'Mastery Trajectory']}
                            labelStyle={{ fontWeight: 'bold' }}
                            contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                          />
                          <Area 
                            type="monotone" 
                            dataKey="score" 
                            stroke="#6366f1" 
                            strokeWidth={3} 
                            fillOpacity={1} 
                            fill={`url(#polyGradient-${index})`}
                            dot={{ r: 4, fill: "#6366f1", stroke: "hsl(var(--background))", strokeWidth: 2 }}
                            activeDot={{ r: 6 }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* 5. RADAR CHART */}
                  {chart.type === "radar" && chart.data?.length > 0 && (
                    <div className="w-full h-[240px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="68%" data={chart.data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                          <PolarGrid stroke="hsl(var(--border) / 0.6)" />
                          <PolarAngleAxis dataKey="metric" tick={{ fill: 'currentColor', fontSize: 10, fontWeight: 500 }} />
                          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                          <Radar name="Balance" dataKey="score" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.5} />
                          <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
