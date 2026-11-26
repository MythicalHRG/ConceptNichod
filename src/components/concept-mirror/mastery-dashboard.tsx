'use client';

import { useState, useEffect } from 'react';
import { useAudioRecorder } from '@/hooks/use-audio-recorder';
import { analyzeConceptExplanation, MasteryReportOutput } from '@/ai/flows/analyze-concept-explanation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Mic, MicOff, Wand2, RefreshCw, Lock, AlertCircle, TrendingUp, BarChart2, Compass, PieChart as PieIcon, Timer, RotateCcw } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend as PieLegend, Tooltip as PieTooltip } from 'recharts';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip as RadarTooltip } from 'recharts';
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as GeneralTooltip } from 'recharts';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FollowUpChat } from '@/components/topic/follow-up-chat';
import { LatexRenderer } from '@/components/ui/latex-renderer';

const PIE_CHART_COLORS = ['#0088FE', '#FFBB28', '#00C49F'];

function normalizeMirrorPentagon(
  raw: Array<{ metric: string; score: number }> | undefined
): Array<{ metric: string; score: number }> {
  const unique: Array<{ metric: string; score: number }> = [];
  const seen = new Set<string>();

  for (const item of Array.isArray(raw) ? raw : []) {
    if (!item || typeof item.metric !== "string" || !Number.isFinite(item.score)) continue;
    const clean = item.metric.trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    unique.push({
      metric: clean.length > 16 ? clean.slice(0, 14) + "…" : clean,
      score: Math.max(0, Math.min(100, Math.round(item.score))),
    });
    if (unique.length === 5) break;
  }

  // Never fill missing dimensions with invented scores.
  return unique;
}

const MasteryReportDisplay = ({ report, conceptName }: { report: MasteryReportOutput; conceptName: string }) => {
  const safeRadarData = normalizeMirrorPentagon(report.radar_chart_data);

  const reportedBarData = Array.isArray(report.bar_chart_data)
    ? report.bar_chart_data
        .filter((item) => item && typeof item.name === "string" && Number.isFinite(item.score))
        .map((item) => ({ name: item.name, score: Math.max(0, Math.min(100, Math.round(item.score))) }))
    : [];
  const safeBarData = reportedBarData.length > 0
    ? reportedBarData
    : safeRadarData.map((item) => ({ name: item.metric, score: item.score }));

  // A single report is one observation, not a learning curve. Ignore model-created phase scores.
  const safePolyData: { step: string; score: number }[] = [];

  const safePieData = Array.isArray(report.pie_chart_data) ? report.pie_chart_data : [];

  const hasMasteryScore = typeof report.overallScore === "number" &&
    Number.isFinite(report.overallScore) && report.overallScore >= 0 && report.overallScore <= 100;
  const masteryScore = hasMasteryScore
    ? Math.max(0, Math.min(100, Math.round(report.overallScore as number)))
    : null;

  const fluffItem = safePieData.find(item => item.name?.toLowerCase() === 'fluff');
  const rawFluffPercent = report.fluffPercentage ?? (fluffItem ? fluffItem.value : null);
  const fluffPercent = typeof rawFluffPercent === "number" && Number.isFinite(rawFluffPercent)
    ? Math.max(0, Math.min(100, Math.round(rawFluffPercent)))
    : null;
  const timeUtilized = report.durationSeconds ?? 0;

  return (
    <Card className="w-full overflow-hidden min-w-0">
      <CardHeader>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="font-headline text-2xl sm:text-3xl break-words">Concept Mastery Report</CardTitle>
            <CardDescription className="text-sm sm:text-base mt-1 break-words">
              Oral concept defense for: <span className="font-semibold text-primary">{conceptName}</span>
            </CardDescription>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full lg:w-auto shrink-0">
            {timeUtilized > 0 && (
              <div className="p-3 rounded-xl border bg-card/60 flex flex-col justify-center text-center sm:text-right shadow-xs">
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">Time Utilized</span>
                <span className="text-base sm:text-lg font-bold font-mono text-foreground">
                  {Math.floor(timeUtilized / 60)}:{(timeUtilized % 60).toString().padStart(2, '0')} / 02:00
                </span>
                <span className="text-[10px] text-muted-foreground block">
                  {Math.min(100, Math.round((timeUtilized / 120) * 100))}% window
                </span>
              </div>
            )}
            <div className="p-3 rounded-xl border bg-card/60 flex flex-col justify-center text-center sm:text-right shadow-xs">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">Fluff Content</span>
              <span className={`text-xl sm:text-2xl font-extrabold ${
                fluffPercent === null
                  ? "text-muted-foreground"
                  : fluffPercent > 35
                  ? "text-destructive"
                  : fluffPercent > 15
                  ? "text-amber-500"
                  : "text-emerald-500"
              }`}>
                {fluffPercent === null ? "—" : `${fluffPercent}%`}
              </span>
              <span className="text-[10px] text-muted-foreground">{fluffPercent === null ? "Not assessed" : "Detected ratio"}</span>
            </div>
            <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 flex flex-col justify-center text-center sm:text-right shadow-xs col-span-2 sm:col-span-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">Mastery Score</span>
              <span className="text-2xl sm:text-3xl font-extrabold text-primary">{masteryScore === null ? "—" : `${masteryScore}%`}</span>
              <span className="text-[10px] text-muted-foreground">{hasMasteryScore ? "Average of verified dimensions" : "Overall score not returned"}</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-8 min-w-0">
        {/* Professor Feedback Section with LaTeX support */}
        <div className="p-5 rounded-xl border bg-muted/30 min-w-0 overflow-hidden">
          <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
            <span>Feedback & Conceptual Evaluation</span>
          </h3>
          <div className="text-sm md:text-base leading-relaxed text-foreground/90 space-y-2 min-w-0 overflow-hidden break-words">
            <LatexRenderer content={report.feedback_summary} />
          </div>
        </div>

        {/* 4 Distinct Non-Repeating Visual Models */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1: BGMI-Style 5-Axis Pentagon Spider / Radar Chart */}
          <div className="rounded-xl border p-4 bg-background shadow-sm flex flex-col justify-between overflow-hidden min-w-0">
            <div className="flex items-center justify-between mb-2 gap-2">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <Compass className="w-4 h-4 text-amber-500" /> Delivery & Rigor Dimensions
              </h4>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30">Verified dimensions</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Verified performance dimensions from this oral defense.</p>
            {safeRadarData.length >= 3 ? (
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="68%" margin={{ top: 14, right: 28, bottom: 14, left: 28 }} data={safeRadarData}>
                  <defs>
                    <linearGradient id="cmBgmiPentagon" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.62} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.22} />
                    </linearGradient>
                  </defs>
                  <PolarGrid gridType="polygon" stroke="hsl(var(--border))" strokeOpacity={0.8} />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: 'currentColor', fontSize: 11, fontWeight: 600 }} />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 100]}
                    tickCount={6}
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }}
                    axisLine={false}
                  />
                  <Radar
                    name="Student Clarity"
                    dataKey="score"
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                    fill="url(#cmBgmiPentagon)"
                    fillOpacity={1}
                    dot={{ r: 4, fill: "#f59e0b", stroke: "hsl(var(--background))", strokeWidth: 1.5 }}
                    activeDot={{ r: 5.5, fill: "hsl(var(--primary))" }}
                  />
                  <RadarTooltip
                    formatter={(val: number) => [`${val}/100`, 'Mastery']}
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--background))', color: 'hsl(var(--foreground))' }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            ) : (
              <div className="h-[280px] flex items-center justify-center rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                Fewer than three verified performance dimensions were returned. A radar chart is not reliable for this report.
              </div>
            )}
          </div>

          {/* Chart 2: Pie / Donut Chart (Content Composition & Fluff Ratio) */}
          <div className="rounded-xl border p-4 bg-background shadow-sm flex flex-col justify-between overflow-hidden min-w-0">
            <div className="flex items-center justify-between mb-2 gap-2">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <PieIcon className="w-4 h-4 text-emerald-500" /> Content Composition
              </h4>
              <div className="flex items-center gap-1.5">
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                  fluffPercent === null
                    ? "bg-muted text-muted-foreground border-border"
                    : fluffPercent > 35
                    ? "bg-destructive/10 text-destructive border-destructive/30"
                    : fluffPercent > 15
                    ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                    : "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                }`}>
                  Fluff: {fluffPercent === null ? "Not assessed" : `${fluffPercent}%`}
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground">Pie / Donut</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Ratio of verifiable scientific fact vs fluff vs insight.</p>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={safePieData}
                    cx="50%"
                    cy="45%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                    labelLine={false}
                    label={({ name, percent }) => {
                      if (!percent || percent < 0.05) return null;
                      return `${name} ${(percent * 100).toFixed(0)}%`;
                    }}
                  >
                    {safePieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_CHART_COLORS[index % PIE_CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <PieTooltip
                    formatter={(val: number) => [`${val}%`, 'Proportion']}
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--background))', color: 'hsl(var(--foreground))' }}
                  />
                  <PieLegend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 3: Bar Chart (Structural Pillars) */}
          <div className="rounded-xl border p-4 bg-background shadow-sm flex flex-col justify-between overflow-hidden min-w-0">
            <div className="flex items-center justify-between mb-2 gap-2">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-amber-500" /> Structural Knowledge Pillars
              </h4>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground">Bar Chart</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Proficiency breakdown across definitions and edge cases.</p>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={safeBarData} margin={{ top: 20, right: 20, left: -10, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.5)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: 'currentColor' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: 'currentColor' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <GeneralTooltip
                    cursor={{ fill: 'transparent' }}
                    formatter={(val: number) => [`${val}%`, 'Score']}
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--background))', color: 'hsl(var(--foreground))' }}
                  />
                  <Bar dataKey="score" fill="#f59e0b" radius={[4, 4, 0, 0]} animationDuration={1000} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 4: Polynomial Spline Area Chart (Explanation Mastery Curve) */}
          <div className="rounded-xl border p-4 bg-background shadow-sm flex flex-col justify-between overflow-hidden min-w-0">
            <div className="flex items-center justify-between mb-2 gap-2">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-500" /> Mastery Explanation Curve
              </h4>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground">Polynomial Spline</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Progress across multiple dated sessions; one explanation cannot establish a trend.</p>
            <div className="h-[280px] w-full">
              {safePolyData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={safePolyData} margin={{ top: 20, right: 20, left: -10, bottom: 25 }}>
                  <defs>
                    <linearGradient id="cmPolyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.5)" />
                  <XAxis
                    dataKey="step"
                    tick={{ fontSize: 11, fill: 'currentColor' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: 'currentColor' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <GeneralTooltip
                    formatter={(val: number) => [`${val}%`, 'Mastery Index']}
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--background))', color: 'hsl(var(--foreground))' }}
                  />
                  <Area type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={2.5} fillOpacity={1} fill="url(#cmPolyGrad)" />
                </AreaChart>
              </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center rounded-lg border border-dashed text-center text-sm text-muted-foreground p-4">
                  A single explanation cannot form a learning curve. Complete more scored sessions to build a chronological progress trend.
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export function MasteryDashboard() {
  const [conceptName, setConceptName] = useState('');
  const [isTopicLocked, setIsTopicLocked] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisReport, setAnalysisReport] = useState<MasteryReportOutput | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const { toast } = useToast();

  const {
    isRecording,
    isConnecting,
    transcript,
    errorMessage,
    startRecording,
    stopRecording,
    resetTranscript,
    isSupported,
  } = useAudioRecorder();

  // Stopwatch timer when recording - increments up to 2-minute (120s) cap
  useEffect(() => {
    if (!isRecording) return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => (prev >= 120 ? 120 : prev + 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isRecording]);

  // Clean side-effect when the 2-minute limit is reached
  useEffect(() => {
    if (isRecording && elapsedSeconds >= 120) {
      stopRecording();
      toast({
        title: "Time Limit Reached (2:00)",
        description: "You have utilized the full 2-minute oral defense window! Ready for analysis.",
      });
    }
  }, [isRecording, elapsedSeconds, stopRecording, toast]);

  const formatStopwatch = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleStartRecording = () => {
    if (!conceptName.trim()) {
      toast({
        variant: 'destructive',
        title: 'Concept Name Required',
        description: 'Please enter the concept name first before speaking.',
      });
      return;
    }
    if (!isSupported) {
      toast({
        variant: 'destructive',
        title: 'Microphone Notice',
        description: 'Microphone voice input is optimized for modern browsers (Chrome, Edge, Safari).',
      });
      return;
    }
    setElapsedSeconds(0);
    startRecording();
  };

  const handleResetSpeech = () => {
    resetTranscript();
    setElapsedSeconds(0);
  };

  const handleAnalysis = async () => {
    if (isAnalyzing) return;
    if (isRecording || isConnecting) {
      toast({ variant: "destructive", title: "Finish Recording First", description: "Stop the microphone and wait for the transcript to settle before analyzing." });
      return;
    }
    const finalExplanation = transcript.trim();

    if (!conceptName.trim()) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please enter the concept name.' });
      return;
    }
    if (!finalExplanation) {
      toast({ variant: 'destructive', title: 'Explanation Required', description: 'Please speak your explanation of the concept first.' });
      return;
    }

    // The UI lock prevents new input while analyzing. Do not permanently lock
    // the recorder: users must be able to retry or start a fresh Concept Mirror.
    stopRecording();
    setIsTopicLocked(true);
    setIsAnalyzing(true);
    setAnalysisReport(null);

    try {
      const report = await analyzeConceptExplanation({
        conceptName: conceptName.trim(),
        userTranscript: finalExplanation,
        durationSeconds: elapsedSeconds
      });
      setAnalysisReport(report);
      toast({ title: 'Analysis Complete!', description: 'Your Mastery Report is ready with equations and charts.' });
    } catch (error: any) {
      console.error("Analysis failed:", error);
      toast({ variant: 'destructive', title: 'Analysis Failed', description: error?.message || 'The AI could not generate a report.' });
      setIsTopicLocked(false);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReset = () => {
    setConceptName('');
    setIsTopicLocked(false);
    setAnalysisReport(null);
    setElapsedSeconds(0);
    resetTranscript();
  };

  if (analysisReport) {
    return (
      <div className="space-y-6 min-w-0 max-w-full overflow-x-hidden">
        <MasteryReportDisplay report={analysisReport} conceptName={conceptName} />

        {/* Follow-up doubts and queries section */}
        <FollowUpChat
          topicName={conceptName}
          topicSummary={analysisReport.feedback_summary}
          classLevel="Class 11-12"
          subject="Concept Mastery"
        />

        <div className="flex justify-center pt-2">
          <Button onClick={handleReset} size="lg" variant="outline">
            <RefreshCw className="mr-2 w-4 h-4" />
            Analyze Another Concept
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card className="w-full overflow-hidden">
      <CardHeader>
        <CardTitle className="font-headline text-3xl">Concept Mirror</CardTitle>
        <CardDescription>
          Explain a concept in your own words using speech and get an instant AI-powered mastery report with equations and charts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {errorMessage && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Audio Notice</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="concept-name">Concept Name</Label>
            {isTopicLocked && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Lock className="w-3 h-3 text-amber-500" /> Topic locked for analysis
              </span>
            )}
          </div>
          <Input
            id="concept-name"
            placeholder="e.g., Newton's Third Law, Photosynthesis, Thermodynamics"
            value={conceptName}
            maxLength={120}
            onChange={(e) => setConceptName(e.target.value)}
            disabled={isTopicLocked || isRecording || isAnalyzing}
            className={isTopicLocked ? "bg-muted cursor-not-allowed text-muted-foreground" : ""}
          />
        </div>

        <div className="space-y-4 rounded-xl border bg-card/60 p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold flex items-center gap-2">
                {isConnecting && (
                  <span className="flex items-center gap-1.5 text-amber-500 font-medium animate-pulse">
                    <Loader2 className="w-4 h-4 animate-spin" /> Preparing microphone...
                  </span>
                )}
                {!isConnecting && isRecording && (
                  <span className="flex items-center gap-2 text-emerald-500 font-semibold">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                    </span>
                    Listening Live • Speak your explanation
                  </span>
                )}
                {!isConnecting && !isRecording && (
                  <span className="text-foreground/90">
                    {transcript ? 'Explanation Captured' : 'Ready to record your verbal explanation'}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Speak clearly into your microphone. The AI evaluates your conceptual clarity and depth.
              </p>
            </div>

            {/* Timer and Action Controls */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
              {/* Live Stopwatch Badge */}
              <div
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-sm font-bold shadow-inner shrink-0 ${
                  isRecording
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                    : elapsedSeconds > 0
                    ? 'bg-muted/70 border-border text-foreground'
                    : 'bg-muted/30 border-border/50 text-muted-foreground'
                }`}
              >
                <Timer className={`w-4 h-4 ${isRecording ? 'animate-pulse text-emerald-500' : ''}`} />
                <span>{formatStopwatch(elapsedSeconds)} / 02:00</span>
              </div>

              {/* Primary Mic Toggle */}
              <Button
                type="button"
                onClick={isRecording ? stopRecording : handleStartRecording}
                disabled={isConnecting || isAnalyzing || isTopicLocked}
                variant={isRecording ? 'destructive' : 'default'}
                className="font-medium shadow-sm transition-all flex-1 sm:flex-none justify-center"
              >
                {isConnecting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : isRecording ? (
                  <MicOff className="mr-2 h-4 w-4" />
                ) : (
                  <Mic className="mr-2 h-4 w-4" />
                )}
                {isConnecting ? 'Starting...' : isRecording ? 'Finish Speaking' : 'Start Speaking'}
              </Button>

              {/* Reset Button */}
              <Button
                type="button"
                onClick={handleResetSpeech}
                disabled={isConnecting || isAnalyzing || isTopicLocked || (!transcript && elapsedSeconds === 0 && !isRecording)}
                variant="outline"
                title="Reset verbal explanation"
                className="text-muted-foreground hover:text-foreground shrink-0"
              >
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Reset
              </Button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-muted-foreground pt-1 px-1 gap-1">
            <span className="flex items-center gap-1">
              <Timer className="w-3.5 h-3.5 text-primary" />
              Maximum Response Window: <strong>2 Minutes (120s)</strong>
            </span>
            <span className="text-[11px] text-muted-foreground/80">
              Utilize maximum time for comprehensive mastery • Fluff & brevity are strictly audited
            </span>
          </div>

          {/* Live Speech Transcript - Strictly Non-Editable (No manual typing) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="explanation-box" className="text-xs font-semibold text-muted-foreground">
                Verbal Explanation
              </Label>
              {transcript && (
                <span className="text-[11px] text-muted-foreground">
                  {transcript.trim().split(/\s+/).filter(Boolean).length} words spoken
                </span>
              )}
            </div>
            <Textarea
              id="explanation-box"
              rows={5}
              placeholder="Tap 'Start Speaking' and articulate your explanation aloud. Your verbal explanation will appear here in real time as you speak..."
              value={transcript}
              readOnly
              disabled={isTopicLocked}
              className="font-sans leading-relaxed bg-muted/40 cursor-default resize-none focus-visible:ring-0 select-text"
            />
          </div>
        </div>
      </CardContent>
      <CardFooter className="pt-2">
        <Button
          onClick={handleAnalysis}
          disabled={!transcript.trim() || !conceptName.trim() || isAnalyzing || isRecording || isConnecting}
          className="w-full"
          size="lg"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Evaluating Concept Clarity & Mastery...
            </>
          ) : (
            <>
              <Wand2 className="mr-2 h-5 w-5" />
              Analyze Concept Explanation
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

export const ConceptMirrorDashboard = MasteryDashboard;
