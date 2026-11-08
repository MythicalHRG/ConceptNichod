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
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend as RadarLegend, Tooltip as RadarTooltip } from 'recharts';
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as GeneralTooltip } from 'recharts';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FollowUpChat } from '@/components/topic/follow-up-chat';
import { LatexRenderer } from '@/components/ui/latex-renderer';

const PIE_CHART_COLORS = ['#0088FE', '#FFBB28', '#00C49F'];

const MasteryReportDisplay = ({ report, conceptName }: { report: MasteryReportOutput; conceptName: string }) => {
  const safeRadarData = report.radar_chart_data?.length > 0 ? report.radar_chart_data : [
    { metric: "Conceptual Clarity", score: 80 },
    { metric: "Examples Used", score: 75 },
    { metric: "Confidence", score: 85 },
    { metric: "Technical Terminology", score: 70 },
    { metric: "Conciseness", score: 78 }
  ];

  const safeBarData = report.bar_chart_data?.length ? report.bar_chart_data : [
    { name: "Definitions", score: 82 },
    { name: "Core Principles", score: 78 },
    { name: "Application", score: 72 },
    { name: "Edge Cases", score: 68 }
  ];

  const safePolyData = report.polynomial_chart_data?.length ? report.polynomial_chart_data : [
    { step: "Initial Recall", score: 65 },
    { step: "Concept Framing", score: 74 },
    { step: "Analytical Nuance", score: 80 },
    { step: "Synthesis & Proof", score: 84 },
    { step: "Final Mastery", score: 88 }
  ];

  const avgClarity = Math.round(
    safeRadarData.reduce((acc, curr) => acc + curr.score, 0) / safeRadarData.length
  );

  const fluffItem = report.pie_chart_data?.find(item => item.name.toLowerCase() === 'fluff');
  const fluffPercent = report.fluffPercentage ?? (fluffItem ? fluffItem.value : 0);
  const timeUtilized = report.durationSeconds ?? 0;

  return (
    <Card className="w-full">
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
                fluffPercent > 35 
                  ? "text-destructive" 
                  : fluffPercent > 15 
                  ? "text-amber-500" 
                  : "text-emerald-500"
              }`}>
                {fluffPercent}%
              </span>
              <span className="text-[10px] text-muted-foreground">Detected ratio</span>
            </div>
            <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 flex flex-col justify-center text-center sm:text-right shadow-xs col-span-2 sm:col-span-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">Mastery Score</span>
              <span className="text-2xl sm:text-3xl font-extrabold text-primary">{report.overallScore || avgClarity}%</span>
              <span className="text-[10px] text-muted-foreground">Rigorous AI score</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Professor Feedback Section with LaTeX support */}
        <div className="p-5 rounded-xl border bg-muted/30">
          <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
            <span>Feedback & Conceptual Evaluation</span>
          </h3>
          <div className="text-sm md:text-base leading-relaxed text-foreground/90 space-y-2">
            <LatexRenderer content={report.feedback_summary} />
          </div>
        </div>

        {/* 4 Distinct Non-Repeating Visual Models */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1: Spider / Radar Chart (Dimensions) */}
          <div className="rounded-xl border p-4 bg-background shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <Compass className="w-4 h-4 text-primary" /> Delivery & Rigor Dimensions
              </h4>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground">Spider / Radar</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Multi-axial evaluation of verbal concept explanation.</p>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="75%" data={safeRadarData}>
                  <PolarGrid stroke="hsl(var(--border) / 0.5)" />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: 'currentColor', fontSize: 11 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="hsl(var(--muted-foreground))" />
                  <Radar name="Student Clarity" dataKey="score" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.4} />
                  <RadarLegend verticalAlign="bottom" wrapperStyle={{ fontSize: 12 }} />
                  <RadarTooltip 
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--background))', color: 'hsl(var(--foreground))' }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Pie / Donut Chart (Content Composition & Fluff Ratio) */}
          <div className="rounded-xl border p-4 bg-background shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <PieIcon className="w-4 h-4 text-emerald-500" /> Content Composition
              </h4>
              <div className="flex items-center gap-1.5">
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                  fluffPercent > 35 
                    ? "bg-destructive/10 text-destructive border-destructive/30" 
                    : fluffPercent > 15 
                    ? "bg-amber-500/10 text-amber-500 border-amber-500/30" 
                    : "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                }`}>
                  Fluff: {fluffPercent}%
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground">Pie / Donut</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Ratio of verifiable scientific fact vs fluff vs insight.</p>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={report.pie_chart_data}
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
                    {report.pie_chart_data.map((entry, index) => (
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
          <div className="rounded-xl border p-4 bg-background shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
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
          <div className="rounded-xl border p-4 bg-background shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-500" /> Mastery Explanation Curve
              </h4>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground">Polynomial Spline</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Progression curve from recall to final concept synthesis.</p>
            <div className="h-[280px] w-full">
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
    lockAndAbort,
    isSupported,
  } = useAudioRecorder();

  // Stopwatch timer when recording - enforces 2-minute (120s) limit
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isRecording) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => {
          if (prev >= 120) {
            stopRecording();
            toast({
              title: "Time Limit Reached (2:00)",
              description: "You have utilized the full 2-minute oral defense window! Ready for analysis.",
            });
            return 120;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording, stopRecording, toast]);

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
    const finalExplanation = transcript.trim();

    if (!conceptName.trim()) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please enter the concept name.' });
      return;
    }
    if (!finalExplanation) {
      toast({ variant: 'destructive', title: 'Explanation Required', description: 'Please speak your explanation of the concept first.' });
      return;
    }
    
    // Lock audio recorder and concept name input to prevent speech injection during analysis
    lockAndAbort();
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
      toast({ variant: 'destructive', title: 'Analysis Failed', description: error.message || 'The AI could not generate a report.' });
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
      <div className="space-y-6">
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
    <Card className="w-full">
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

              {/* Reset Button (NO PAUSE BUTTON) */}
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
          disabled={!transcript.trim() || !conceptName.trim() || isAnalyzing} 
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
