"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { FinalAnalysisOutput } from "@/ai/flows/analyze-answers";
import {
  CheckCircle, Info, Star, Target, BarChart2, PieChart as PieIcon,
  Award, TrendingUp, Layers, Compass, ShieldCheck, ShieldAlert, AlertTriangle, BookOpen, Printer
} from "lucide-react";
import {
  Bar, BarChart as BarChartComponent, CartesianGrid, XAxis, YAxis,
  Pie, PieChart as PieChartComponent, Cell, Tooltip, ResponsiveContainer,
  Area, AreaChart, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend
} from "recharts";
import { LatexRenderer } from "@/components/ui/latex-renderer";
import { Badge } from "@/components/ui/badge";

interface FinalAnalysisDisplayProps {
  analysis: FinalAnalysisOutput;
  topicName: string;
}

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

function normalizePentagonRadarData(items: Array<{ metric: string; score: number }>): Array<{ metric: string; score: number }> {
  const unique: Array<{ metric: string; score: number }> = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item || typeof item.metric !== "string" || !Number.isFinite(item.score)) continue;
    const label = item.metric.trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    unique.push({ metric: label.length > 18 ? label.slice(0, 16) + "…" : label, score: Math.max(0, Math.min(100, Math.round(item.score))) });
    if (unique.length === 5) break;
  }
  // Never invent radar dimensions when the examiner returned fewer verified metrics.
  return unique;
}

export function FinalAnalysisDisplay({ analysis, topicName }: FinalAnalysisDisplayProps) {
  const [charts, setCharts] = useState<any[]>([]);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
    let rawList: any[] = [];
    if (Array.isArray(analysis.chartsData)) {
      rawList = analysis.chartsData;
    } else if (typeof analysis.chartsData === "string" && analysis.chartsData.trim()) {
      try {
        let parsed = JSON.parse(analysis.chartsData);
        if (typeof parsed === "string") parsed = JSON.parse(parsed);
        if (Array.isArray(parsed)) rawList = parsed;
      } catch (error) {
        console.warn("Could not parse AI performance charts; using a no-data state:", error);
      }
    }
    const availableTypes = ["bar", "pie", "histo", "polynomial", "radar"];
    const seenTypes = new Set<string>();
    const verifiedCharts: any[] = [];
    for (const chart of rawList.slice(0, 25)) {
      if (!chart || typeof chart !== "object" || !availableTypes.includes(chart.type) || seenTypes.has(chart.type) || !Array.isArray(chart.data)) continue;
      const data = chart.data.slice(0, 30).filter((item: any) => {
        if (!item || typeof item !== "object") return false;
        if (chart.type === "pie") return typeof item.name === "string" && item.name.length <= 100 && Number.isFinite(item.value) && item.value >= 0;
        if (chart.type === "radar") return typeof item.metric === "string" && item.metric.length <= 100 && Number.isFinite(item.score);
        if (chart.type === "polynomial") return typeof item.step === "string" && item.step.length <= 100 && Number.isFinite(item.score);
        return typeof item.name === "string" && item.name.length <= 100 && Number.isFinite(item.score);
      }).map((item: any) => {
        if (chart.type === "pie") return { ...item, value: Math.max(0, Math.min(100, item.value)) };
        return { ...item, score: Math.max(0, Math.min(100, item.score)) };
      });
      if (data.length === 0) continue;
      const chartData = chart.type === "radar" ? normalizePentagonRadarData(data) : data;
      if (chartData.length === 0) continue;
      seenTypes.add(chart.type);
      verifiedCharts.push({
        type: chart.type,
        title: typeof chart.title === "string" ? chart.title.slice(0, 120) : "Performance chart",
        description: typeof chart.description === "string" ? chart.description.slice(0, 500) : "",
        data: chartData,
      });
    }
    setCharts(verifiedCharts);
  }, [analysis]);

  const auth = analysis.authenticityReport;
  const rawOverallScore = analysis.overallScore;
  const hasOverallScore = typeof rawOverallScore === "number" && Number.isFinite(rawOverallScore) && rawOverallScore >= 0 && rawOverallScore <= 100;
  const safeOverallScore = hasOverallScore ? Math.max(0, Math.min(100, rawOverallScore)) : 0;
  const rawNaturalScore = auth?.naturalConfidenceScore;
  const hasAuthenticityReport = Boolean(auth && typeof auth.isNatural === "boolean" &&
    ["natural_human", "suspicious_synthetic", "nonsense_or_filler", "blended"].includes(auth.verdict) &&
    typeof rawNaturalScore === "number" && Number.isFinite(rawNaturalScore) && rawNaturalScore >= 0 && rawNaturalScore <= 100);
  const naturalScore = hasAuthenticityReport ? Math.round(rawNaturalScore as number) : null;
  const verdict = hasAuthenticityReport && auth ? auth.verdict : "unavailable";

  const areasToFocus = Array.isArray(analysis.areasToFocus) ? analysis.areasToFocus : [];
  const areasToImprove = Array.isArray(analysis.areasToImprove) ? analysis.areasToImprove : [];
  const keyTermsForBonus = Array.isArray(analysis.keyTermsForBonus) ? analysis.keyTermsForBonus : [];
  const extraTips = Array.isArray(analysis.extraTips) ? analysis.extraTips : [];

  return (
    <div className="space-y-8 min-w-0 max-w-full overflow-x-hidden">
      {/* Overall Score Banner */}
      <Card className="bg-gradient-to-br from-primary/10 via-background to-secondary/30 border-primary/30 overflow-hidden">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <CardTitle className="font-headline text-2xl sm:text-3xl text-primary flex items-center gap-2 break-words">
                <Award className="w-7 h-7 sm:w-8 sm:h-8 text-primary shrink-0" />
                <span>Performance Diagnostic Analysis</span>
              </CardTitle>
              <CardDescription className="text-sm sm:text-base mt-1 flex items-center gap-1.5 flex-wrap">
                <span>Rigorous evaluation for topic:</span>
                <strong className="inline-block break-words min-w-0"><LatexRenderer content={topicName} /></strong>
              </CardDescription>
            </div>
            <div className="flex items-center gap-3 flex-wrap shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="gap-1.5 text-xs print:hidden shadow-xs border-primary/30 hover:bg-primary/10"
              >
                <Printer className="w-3.5 h-3.5 text-primary" />
                <span>Print Cheat Sheet</span>
              </Button>
              {analysis.overallScore !== undefined && (
                <div className="text-right bg-background/80 px-4 py-2 rounded-xl border border-primary/20 shadow-sm">
                  <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Overall Score</p>
                  <p className="text-3xl font-black text-primary">{hasOverallScore ? `${safeOverallScore}/100` : "—"}</p>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 min-w-0">
          <div className="text-base text-foreground/90 leading-relaxed bg-background/60 p-4 rounded-lg border border-border/60 min-w-0 max-w-full overflow-hidden break-words">
            <LatexRenderer content={analysis.performanceSummary} />
          </div>
        </CardContent>
      </Card>

      {/* Linguistic Authenticity & Natural vs AI Detection Card */}
      <Card className="border border-border/80 shadow-sm overflow-hidden">
        <div className={`h-1.5 w-full ${
          verdict === "natural_human"
            ? "bg-emerald-500"
            : verdict === "suspicious_synthetic"
            ? "bg-destructive"
            : "bg-amber-500"
        }`} />
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {verdict === "natural_human" ? (
                <ShieldCheck className="w-6 h-6 text-emerald-500 shrink-0" />
              ) : verdict === "suspicious_synthetic" ? (
                <ShieldAlert className="w-6 h-6 text-destructive shrink-0" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0" />
              )}
              <div className="min-w-0">
                <CardTitle className="text-lg font-bold break-words">Linguistic Authenticity & Authorship Verification</CardTitle>
                <CardDescription className="text-xs">
                  AI authorship estimate, when returned by the examiner
                </CardDescription>
              </div>
            </div>

            <Badge variant="outline" className={`px-3 py-1 font-semibold text-xs ${
              verdict === "natural_human"
                ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                : verdict === "suspicious_synthetic"
                ? "border-destructive/40 text-destructive bg-destructive/10"
                : "border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10"
            }`}>
              {verdict === "natural_human" && `Authentic Natural Voice (${naturalScore}% Confidence)`}
              {verdict === "suspicious_synthetic" && `Suspected AI/ChatGPT Generated (${100 - naturalScore}% AI Probability)`}
              {verdict === "nonsense_or_filler" && `Low-Effort / Irrelevant Content Detected (${naturalScore}% Natural)`}
              {verdict === "blended" && `Blended Natural & Structured Expression (${naturalScore}%)`}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-0 min-w-0">
          <div className="text-sm text-foreground/80 leading-relaxed bg-muted/40 p-3 rounded-lg border border-border/40 min-w-0 max-w-full overflow-hidden break-words">
            <LatexRenderer
              content={
                auth?.assessmentDetails ||
                "The authenticity detector did not return a verified assessment for this test. No authorship estimate is available."
              }
            />
          </div>

          {auth?.flaggedAnswers && auth.flaggedAnswers.length > 0 && (
            <div className="mt-2 space-y-1.5 border-t border-border/40 pt-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Flagged Items:</p>
              <div className="space-y-1">
                {auth.flaggedAnswers.map((flag, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs p-2 rounded bg-destructive/5 text-destructive border border-destructive/20 min-w-0">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0 overflow-hidden break-words">
                      <strong>Question {flag.questionNumber}: </strong>
                      <LatexRenderer content={flag.reason} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Accordion Detailed Feedback Sections */}
      <Card className="bg-secondary/20 border-border/80 overflow-hidden">
        <CardContent className="pt-6 min-w-0">
          <Accordion type="multiple" defaultValue={["critiques", "focus", "improve", "bonus", "tips"]} className="w-full space-y-4">

            {/* Detailed Question-by-Question Diagnostic Audit */}
            {analysis.questionCritiques && analysis.questionCritiques.length > 0 && (
              <AccordionItem value="critiques" className="border rounded-lg bg-background px-4 overflow-hidden">
                <AccordionTrigger className="text-lg font-semibold hover:no-underline text-left">
                  <div className="flex items-center gap-3 min-w-0">
                    <BookOpen className="text-primary w-5 h-5 shrink-0" />
                    <span className="break-words">Question-by-Question Comprehensive Diagnostic Breakdown</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-2 text-base space-y-4 min-w-0 overflow-hidden">
                  {analysis.questionCritiques.map((critique, idx) => (
                    <div key={idx} className="p-4 rounded-xl border border-border/70 bg-muted/20 space-y-3 min-w-0 overflow-hidden">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-sm text-primary">Question {critique.questionNumber}</span>
                        <Badge variant={critique.scoreOutOf10 >= 7 ? "default" : critique.scoreOutOf10 >= 4 ? "secondary" : "destructive"}>
                          Score: {Number.isFinite(critique.scoreOutOf10) ? Math.max(0, Math.min(10, critique.scoreOutOf10)) : 0}/10
                        </Badge>
                      </div>

                      <div className="text-sm font-medium text-foreground min-w-0 overflow-hidden break-words">
                        <LatexRenderer content={critique.questionText} />
                      </div>

                      <div className="text-xs p-2.5 rounded bg-background border border-border/60 min-w-0 overflow-hidden">
                        <span className="font-semibold text-muted-foreground block mb-1">Your Answer: </span>
                        <div className="italic min-w-0 overflow-hidden break-words">
                          <LatexRenderer content={critique.userAnswer || "[No answer provided]"} />
                        </div>
                      </div>

                      <div className="text-sm text-foreground/90 min-w-0 overflow-hidden break-words">
                        <strong>Examiner Diagnostic: </strong>
                        <LatexRenderer content={critique.conceptualAccuracy} />
                      </div>

                      {critique.missingPoints && critique.missingPoints.length > 0 && (
                        <div className="text-xs space-y-1 min-w-0 overflow-hidden">
                          <span className="font-semibold text-destructive">Crucial Points Omitted:</span>
                          <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">
                            {critique.missingPoints.map((mp, mi) => (
                              <li key={mi} className="min-w-0 break-words"><LatexRenderer content={mp} /></li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {critique.idealDerivationOrAnswer && (
                        <div className="text-xs p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 min-w-0 overflow-hidden break-words">
                          <span className="font-bold block mb-1">Ideal Rigorous Derivation / Solution:</span>
                          <LatexRenderer content={critique.idealDerivationOrAnswer} />
                        </div>
                      )}
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
            )}

            <AccordionItem value="focus" className="border rounded-lg bg-background px-4 overflow-hidden">
              <AccordionTrigger className="text-lg font-semibold hover:no-underline text-left">
                <div className="flex items-center gap-3 min-w-0">
                  <Target className="text-primary w-5 h-5 shrink-0" />
                  <span className="break-words">Areas to Focus (Deep Conceptual Foundations)</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-2 text-base min-w-0 overflow-hidden">
                <ul className="list-disc pl-5 space-y-2.5">
                  {areasToFocus.map((item, index) => (
                    <li key={index} className="leading-relaxed min-w-0 break-words">
                      <LatexRenderer content={item} />
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="improve" className="border rounded-lg bg-background px-4 overflow-hidden">
              <AccordionTrigger className="text-lg font-semibold hover:no-underline text-left">
                <div className="flex items-center gap-3 min-w-0">
                  <CheckCircle className="text-emerald-500 w-5 h-5 shrink-0" />
                  <span className="break-words">Specific Technical Weaknesses to Fix</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-2 text-base min-w-0 overflow-hidden">
                <ul className="list-disc pl-5 space-y-2.5">
                  {areasToImprove.map((item, index) => (
                    <li key={index} className="leading-relaxed min-w-0 break-words">
                      <LatexRenderer content={item} />
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="bonus" className="border rounded-lg bg-background px-4 overflow-hidden">
              <AccordionTrigger className="text-lg font-semibold hover:no-underline text-left">
                <div className="flex items-center gap-3 min-w-0">
                  <Star className="text-amber-500 w-5 h-5 shrink-0" />
                  <span className="break-words">Key Technical Terminology for Bonus Marks</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-2 text-base min-w-0 overflow-hidden">
                <ul className="list-disc pl-5 space-y-2.5">
                  {keyTermsForBonus.map((item, index) => (
                    <li key={index} className="leading-relaxed min-w-0 break-words">
                      <LatexRenderer content={item} />
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="tips" className="border rounded-lg bg-background px-4 overflow-hidden">
              <AccordionTrigger className="text-lg font-semibold hover:no-underline text-left">
                <div className="flex items-center gap-3 min-w-0">
                  <Info className="text-blue-500 w-5 h-5 shrink-0" />
                  <span className="break-words">Competitive Exam Tactics & Retention Heuristics</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-2 text-base min-w-0 overflow-hidden">
                <ul className="list-disc pl-5 space-y-2.5">
                  {extraTips.map((item, index) => (
                    <li key={index} className="leading-relaxed min-w-0 break-words">
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
      {hasMounted && charts.length > 0 ? (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-primary" />
              <h3 className="text-xl font-bold font-headline">Multi-Dimensional Performance Analytics</h3>
            </div>
            <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full font-medium">
              {charts.length} verified chart{charts.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
            {charts.map((chart, i) => (
              <Card key={`chart-${chart.type}-${i}`} className="p-5 border-border shadow-sm flex flex-col justify-between overflow-hidden min-w-0">
                <div className="mb-4 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-base font-semibold flex items-center gap-2 font-headline min-w-0 break-words">
                      {chart.type === "bar" && <BarChart2 className="w-4 h-4 text-primary shrink-0" />}
                      {chart.type === "pie" && <PieIcon className="w-4 h-4 text-emerald-500 shrink-0" />}
                      {chart.type === "histo" && <Layers className="w-4 h-4 text-amber-500 shrink-0" />}
                      {chart.type === "polynomial" && <TrendingUp className="w-4 h-4 text-blue-500 shrink-0" />}
                      {chart.type === "radar" && <Compass className="w-4 h-4 text-purple-500 shrink-0" />}
                      <span className="truncate">{chart.title}</span>
                    </h4>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                      {chart.type}
                    </span>
                  </div>
                  {chart.description && (
                    <div className="text-xs text-muted-foreground mt-1 min-w-0 overflow-hidden break-words">
                      <LatexRenderer content={chart.description} />
                    </div>
                  )}
                </div>

                <div className="flex-1 flex items-center justify-center min-w-0">
                  {/* 1. BAR CHART */}
                  {chart.type === "bar" && chart.data?.length > 0 && (
                    <div className="w-full h-[240px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChartComponent data={chart.data} margin={{ top: 15, right: 20, bottom: 25, left: -10 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.5)" />
                          <XAxis
                            dataKey="name"
                            tickLine={false}
                            axisLine={false}
                            tick={{ fontSize: 10, fill: "currentColor" }}
                            tickMargin={8}
                          />
                          <YAxis
                            domain={[0, 100]}
                            tickLine={false}
                            axisLine={false}
                            tick={{ fontSize: 11, fill: "currentColor" }}
                            tickFormatter={(v) => `${v}%`}
                          />
                          <Tooltip
                            cursor={{ fill: "transparent", stroke: "none" }}
                            formatter={(val: number) => [`${val}%`, "Score"]}
                            contentStyle={{ backgroundColor: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
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
                            contentStyle={{ backgroundColor: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                          />
                          <Pie
                            data={chart.data.filter((d: any) => typeof d.value === "number" && d.value > 0)}
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
                            tick={{ fontSize: 10, fill: "currentColor" }}
                            tickMargin={8}
                          />
                          <YAxis
                            allowDecimals={false}
                            tickLine={false}
                            axisLine={false}
                            tick={{ fontSize: 11, fill: "currentColor" }}
                          />
                          <Tooltip
                            cursor={{ fill: "transparent", stroke: "none" }}
                            formatter={(val: number) => [`${val} answers`, "Frequency"]}
                            contentStyle={{ backgroundColor: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
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

                  {/* 4. POLYNOMIAL SPLINE AREA CHART */}
                  {chart.type === "polynomial" && chart.data?.length > 0 && (
                    <div className="w-full h-[240px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chart.data} margin={{ top: 15, right: 20, bottom: 25, left: -10 }}>
                          <defs>
                            <linearGradient id="polyGradFinal" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.5)" />
                          <XAxis
                            dataKey="step"
                            tickLine={false}
                            axisLine={false}
                            tick={{ fontSize: 10, fill: "currentColor" }}
                            tickMargin={8}
                          />
                          <YAxis
                            domain={[0, 100]}
                            tickLine={false}
                            axisLine={false}
                            tick={{ fontSize: 11, fill: "currentColor" }}
                            tickFormatter={(v) => `${v}%`}
                          />
                          <Tooltip
                            formatter={(val: number) => [`${val}%`, "Mastery Index"]}
                            contentStyle={{ backgroundColor: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                          />
                          <Area
                            type="monotone"
                            dataKey="score"
                            stroke="hsl(var(--primary))"
                            strokeWidth={2.5}
                            fillOpacity={1}
                            fill="url(#polyGradFinal)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* 5. BGMI-STYLE PENTAGON SPIDER WEB RADAR MATRIX */}
                  {chart.type === "radar" && chart.data?.length > 0 && (
                    <div className="w-full h-[270px] flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart
                          cx="50%"
                          cy="50%"
                          outerRadius="68%"
                          margin={{ top: 14, right: 28, bottom: 14, left: 28 }}
                          data={chart.data}
                        >
                          <defs>
                            <linearGradient id="bgmiPentagonFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.62} />
                              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.22} />
                            </linearGradient>
                          </defs>
                          <PolarGrid
                            gridType="polygon"
                            stroke="hsl(var(--border))"
                            strokeOpacity={0.75}
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
                            name="Skill Mastery"
                            dataKey="score"
                            stroke="#f59e0b"
                            strokeWidth={2.5}
                            fill="url(#bgmiPentagonFill)"
                            fillOpacity={1}
                            dot={{ r: 4, fill: "#f59e0b", stroke: "hsl(var(--background))", strokeWidth: 1.5 }}
                            activeDot={{ r: 5.5, fill: "hsl(var(--primary))" }}
                          />
                          <Tooltip
                            formatter={(val: number) => [`${val}/100`, "Mastery"]}
                            contentStyle={{ backgroundColor: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : hasMounted ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No verified performance charts were returned for this test. The overall score and written feedback remain available above; charts will not be estimated from the total score.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
