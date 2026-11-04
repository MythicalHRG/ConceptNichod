'use client';

import { useState, useEffect } from 'react';
import { useAudioRecorder } from '@/hooks/use-audio-recorder';
import { analyzeConceptExplanation, MasteryReportOutput } from '@/ai/flows/analyze-concept-explanation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Mic, MicOff, Wand2, RefreshCw, Lock } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend as PieLegend, Tooltip as PieTooltip } from 'recharts';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend as RadarLegend, Tooltip as RadarTooltip } from 'recharts';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

const PIE_CHART_COLORS = ['#0088FE', '#FFBB28', '#00C49F'];

const MasteryReportDisplay = ({ report, conceptName }: { report: MasteryReportOutput; conceptName: string }) => (
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
                <p className="text-muted-foreground whitespace-pre-line leading-relaxed">{report.feedback_summary}</p>
            </div>
            <div className="grid md:grid-cols-2 gap-8 items-center">
                <div>
                    <h3 className="text-xl font-semibold mb-4 text-center">Skill Balance</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={report.radar_chart_data}>
                            <PolarGrid />
                            <PolarAngleAxis dataKey="metric" />
                            <PolarRadiusAxis angle={30} domain={[0, 100]} />
                            <Radar name="Your Score" dataKey="score" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.6} />
                            <RadarTooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}/>
                            <RadarLegend />
                        </RadarChart>
                    </ResponsiveContainer>
                </div>
                 <div>
                    <h3 className="text-xl font-semibold mb-4 text-center">Knowledge Composition</h3>
                    <ResponsiveContainer width="100%" height={300}>
                         <PieChart>
                            <Pie
                                data={report.pie_chart_data}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="value"
                                nameKey="name"
                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            >
                                {report.pie_chart_data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={PIE_CHART_COLORS[index % PIE_CHART_COLORS.length]} />
                                ))}
                            </Pie>
                            <PieTooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}/>
                            <PieLegend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </CardContent>
    </Card>
);

export function ConceptMirrorDashboard() {
  const [conceptName, setConceptName] = useState('');
  const [isTopicLocked, setIsTopicLocked] = useState(false);
  const [manualTranscript, setManualTranscript] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisReport, setAnalysisReport] = useState<MasteryReportOutput | null>(null);

  const { toast } = useToast();
  const { isRecording, isConnecting, transcript, startRecording, stopRecording, resetTranscript } = useAudioRecorder();

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
        toast({ title: 'Analysis Complete!', description: 'Your Mastery Report is ready.' });
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
               <div className="flex justify-center">
                   <Button onClick={handleReset} size="lg">
                       <RefreshCw className="mr-2" />
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
          Explain a concept in your own words using speech and get an instant AI-powered mastery report.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
                    <p className="text-sm font-medium">
                        {isRecording ? 'Listening... Speak your explanation now' : 'Ready to record your speech.'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Powered by browser Web Speech API. No API keys needed.
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
