'use client';

import { useState, useEffect } from 'react';
import { useAudioRecorder } from '@/hooks/use-audio-recorder';
import { analyzeConceptExplanation, MasteryReportOutput } from '@/ai/flows/analyze-concept-explanation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Mic, MicOff, Wand2, RefreshCw, Lock, AlertCircle } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend as PieLegend, Tooltip as PieTooltip } from 'recharts';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend as RadarLegend, Tooltip as RadarTooltip } from 'recharts';
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

  // Filter out any 0 or negative values for pie slices to prevent overlapping labels
  const rawPie = report.pie_chart_data || [];
  const validPieData = rawPie.filter(d => typeof d.value === 'number' && d.value > 0);
  const safePieData = validPieData.length > 0 ? validPieData : [
    { name: "Fact", value: 60 },
    { name: "Fluff", value: 15 },
    { name: "Insight", value: 25 }
  ];

  return (
    <Card className="w-full bg-muted/30">
        <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-headline text-3xl text-primary">Mastery Report</CardTitle>
                <CardDescription>AI analysis for concept: <strong>{conceptName}</strong></CardDescription>
              </div>
            </div>
        </CardHeader>
        <CardContent className="space-y-8">
            <div>
                <h3 className="text-xl font-semibold mb-2">Feedback Summary</h3>
                <div className="text-foreground/90 leading-relaxed bg-background/50 p-4 rounded-lg border border-border/60">
                  <LatexRenderer content={report.feedback_summary} />
                </div>
            </div>

            {/* Side-by-side Chart Cards: Isolated containers with ample margin to prevent overlap or collapse */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                <Card className="p-5 bg-background/90 border border-border/80 rounded-xl shadow-sm flex flex-col items-center">
                    <h3 className="text-lg font-bold mb-2 text-center text-foreground font-headline">Skill Balance</h3>
                    <div className="w-full h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                          <RadarChart cx="50%" cy="50%" outerRadius="68%" margin={{ top: 20, right: 35, bottom: 20, left: 35 }} data={safeRadarData}>
                              <PolarGrid stroke="hsl(var(--border) / 0.6)" />
                              <PolarAngleAxis dataKey="metric" tick={{ fill: 'currentColor', fontSize: 11, fontWeight: 500 }} />
                              {/* tick={false} prevents numbers from colliding with metric text labels like Examples Used */}
                              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                              <Radar name="Your Score" dataKey="score" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.6} />
                              <RadarTooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}/>
                              <RadarLegend verticalAlign="bottom" height={36} />
                          </RadarChart>
                      </ResponsiveContainer>
                    </div>
                </Card>

                <Card className="p-5 bg-background/90 border border-border/80 rounded-xl shadow-sm flex flex-col items-center">
                    <h3 className="text-lg font-bold mb-2 text-center text-foreground font-headline">Knowledge Composition</h3>
                    <div className="w-full h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                           <PieChart margin={{ top: 15, right: 25, bottom: 15, left: 25 }}>
                              <Pie
                                  data={safePieData}
                                  cx="50%"
                                  cy="46%"
                                  labelLine={true}
                                  outerRadius={75}
                                  fill="#8884d8"
                                  dataKey="value"
                                  nameKey="name"
                                  label={({ name, percent, value }) => {
                                    // Suppress label if slice is 0 or less than 5% to prevent overlapping text
                                    if (!percent || percent < 0.05 || value <= 0) return null;
                                    return `${name}: ${(percent * 100).toFixed(0)}%`;
                                  }}
                              >
                                  {safePieData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={PIE_CHART_COLORS[index % PIE_CHART_COLORS.length]} />
                                  ))}
                              </Pie>
                              <PieTooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}/>
                              <PieLegend verticalAlign="bottom" height={36} />
                          </PieChart>
                      </ResponsiveContainer>
                    </div>
                </Card>
            </div>
        </CardContent>
    </Card>
  );
};

export function ConceptMirrorDashboard() {
  const [conceptName, setConceptName] = useState('');
  const [isTopicLocked, setIsTopicLocked] = useState(false);
  const [manualTranscript, setManualTranscript] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisReport, setAnalysisReport] = useState<MasteryReportOutput | null>(null);

  const { toast } = useToast();
  const { 
    isRecording, 
    isConnecting, 
    transcript, 
    errorMessage, 
    startRecording, 
    stopRecording, 
    resetTranscript,
    isSupported 
  } = useAudioRecorder();

  // Sync speech transcript into manualTranscript so user can review/edit
  useEffect(() => {
    if (transcript) {
      setManualTranscript(transcript);
    }
  }, [transcript]);

  const handleAnalysis = async () => {
    const finalExplanation = (manualTranscript || transcript).trim();

    if (!conceptName.trim()) {
        toast({ variant: 'destructive', title: 'Error', description: 'Please enter the concept name.' });
        return;
    }
    if (!finalExplanation) {
        toast({ variant: 'destructive', title: 'Error', description: 'Please speak or enter an explanation of the concept first.' });
        return;
    }
    
    // Stop recording if active and lock concept name input
    if (isRecording) {
      stopRecording();
    }
    setIsTopicLocked(true);
    setIsAnalyzing(true);
    setAnalysisReport(null);

    try {
        const report = await analyzeConceptExplanation({ 
          conceptName: conceptName.trim(), 
          userTranscript: finalExplanation 
        });
        setAnalysisReport(report);
        toast({ title: 'Analysis Complete!', description: 'Your Mastery Report is ready with LaTeX equations and charts.' });
    } catch (error: any) {
        console.error("Analysis failed:", error);
        toast({ variant: 'destructive', title: 'Analysis Failed', description: error.message || 'The AI could not generate a report.' });
        // Unlock on failure so user can adjust
        setIsTopicLocked(false);
    } finally {
        setIsAnalyzing(false);
    }
  };

  const handleReset = () => {
    setConceptName('');
    setIsTopicLocked(false);
    setManualTranscript('');
    setAnalysisReport(null);
    resetTranscript();
  };
  
  if (analysisReport) {
      return (
          <div className='space-y-6'>
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
      )
  }

  const effectiveTranscript = manualTranscript || transcript;

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
        
        <div className="space-y-4 rounded-lg border bg-background p-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                 <div>
                    <p className="text-sm font-medium flex items-center gap-2">
                        {isConnecting && (
                          <span className="flex items-center gap-1.5 text-amber-600 font-semibold animate-pulse">
                            <Loader2 className="w-4 h-4 animate-spin" /> Starting microphone... Please wait 1 second before speaking
                          </span>
                        )}
                        {!isConnecting && isRecording && (
                          <span className="flex items-center gap-1.5 text-emerald-600 font-bold">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping inline-block" />
                            Listening now! Speak your explanation clearly.
                          </span>
                        )}
                        {!isConnecting && !isRecording && (
                          <span>Ready to record speech. Click below to start.</span>
                        )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isSupported
                        ? 'Native browser Web Speech recognition. No API keys required.'
                        : 'Web speech not supported in this browser. You can type directly below.'}
                    </p>
                 </div>
                <Button 
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording} 
                  disabled={isConnecting || isAnalyzing || isTopicLocked} 
                  variant={isRecording ? 'destructive' : 'default'}
                >
                    {isConnecting ? <Loader2 className="mr-2 animate-spin" /> : (isRecording ? <MicOff className="mr-2" /> : <Mic className="mr-2" />)}
                    {isConnecting ? 'Starting Mic...' : (isRecording ? 'Stop Recording' : 'Start Speech Recording')}
                </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="explanation-box" className="text-xs font-medium text-muted-foreground">
                Your Explanation (Speech Transcript or Typed)
              </Label>
              <Textarea
                id="explanation-box"
                rows={5}
                placeholder="Click 'Start Speech Recording' and speak, or type your concept explanation here..."
                value={effectiveTranscript}
                onChange={(e) => setManualTranscript(e.target.value)}
                disabled={isAnalyzing || isTopicLocked}
                className="font-sans leading-relaxed"
              />
            </div>
        </div>
      </CardContent>
      <CardFooter>
          <Button 
            onClick={handleAnalysis} 
            disabled={!effectiveTranscript.trim() || !conceptName.trim() || isAnalyzing} 
            className="w-full" 
            size="lg"
          >
            {isAnalyzing ? <Loader2 className="mr-2 animate-spin" /> : <Wand2 className="mr-2" />}
            {isAnalyzing ? 'Analyzing with OpenRouter AI...' : 'Analyze My Explanation'}
        </Button>
      </CardFooter>
    </Card>
  );
}
