'use client';

import { useState } from 'react';
import { useAudioRecorder } from '@/hooks/use-audio-recorder';
import { analyzeConceptExplanation, MasteryReportOutput } from '@/ai/flows/analyze-concept-explanation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Mic, MicOff, Wand2, RefreshCw } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend as PieLegend, Tooltip as PieTooltip } from 'recharts';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend as RadarLegend, Tooltip as RadarTooltip } from 'recharts';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

const PIE_CHART_COLORS = ['#0088FE', '#FFBB28', '#00C49F'];

const MasteryReportDisplay = ({ report }: { report: MasteryReportOutput }) => (
    <Card className="w-full bg-muted/30">
        <CardHeader>
            <CardTitle className="font-headline text-3xl text-primary">Mastery Report</CardTitle>
            <CardDescription>Here is the AI's analysis of your explanation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
            <div>
                <h3 className="text-xl font-semibold mb-2">Feedback Summary</h3>
                <p className="text-muted-foreground">{report.feedback_summary}</p>
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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisReport, setAnalysisReport] = useState<MasteryReportOutput | null>(null);

  const { toast } = useToast();
  const { isRecording, isConnecting, transcript, startRecording, stopRecording } = useAudioRecorder();

  const handleAnalysis = async () => {
    if (!transcript) {
        toast({ variant: 'destructive', title: 'Error', description: 'Please record an explanation first.' });
        return;
    }
    if (!conceptName) {
        toast({ variant: 'destructive', title: 'Error', description: 'Please enter the concept name.' });
        return;
    }
    
    setIsAnalyzing(true);
    setAnalysisReport(null);

    try {
        const report = await analyzeConceptExplanation({ conceptName, userTranscript: transcript });
        setAnalysisReport(report);
        toast({ title: 'Analysis Complete!', description: 'Your Mastery Report is ready.' });
    } catch (error: any) {
        console.error("Analysis failed:", error);
        toast({ variant: 'destructive', title: 'Analysis Failed', description: error.message || 'The AI could not generate a report.' });
    } finally {
        setIsAnalyzing(false);
    }
  };

  const handleReset = () => {
    setConceptName('');
    setAnalysisReport(null);
    // The transcript is reset automatically by the hook on new recording
  };
  
  if (analysisReport) {
      return (
          <div className='space-y-6'>
              <MasteryReportDisplay report={analysisReport} />
               <div className="flex justify-center">
                   <Button onClick={handleReset} size="lg">
                       <RefreshCw className="mr-2" />
                       Analyze Another Concept
                   </Button>
               </div>
          </div>
      )
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="font-headline text-3xl">Concept Mirror</CardTitle>
        <CardDescription>
          Explain a concept in your own words and get an instant AI-powered mastery report.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
            <Label htmlFor="concept-name">Concept Name</Label>
            <Input 
                id="concept-name" 
                placeholder="e.g., Newton's Third Law"
                value={conceptName}
                onChange={(e) => setConceptName(e.target.value)}
                disabled={isRecording || isAnalyzing}
            />
        </div>
        
        <div className="space-y-4 rounded-lg border bg-background p-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                 <p className="text-sm font-medium">
                    {isRecording ? 'Recording your explanation...' : 'Ready to record your explanation.'}
                </p>
                <Button onClick={isRecording ? stopRecording : startRecording} disabled={isConnecting} variant={isRecording ? 'destructive' : 'default'}>
                    {isConnecting ? <Loader2 className="mr-2 animate-spin" /> : (isRecording ? <MicOff className="mr-2" /> : <Mic className="mr-2" />)}
                    {isConnecting ? 'Connecting Mic...' : (isRecording ? 'Stop Recording' : 'Start Recording')}
                </Button>
            </div>
            {transcript && (
                 <Alert variant="default" className="bg-muted/50">
                    <AlertTitle>Your Transcript</AlertTitle>
                    <AlertDescription className="text-muted-foreground">{transcript}</AlertDescription>
                </Alert>
            )}
        </div>
      </CardContent>
      <CardFooter>
          <Button onClick={handleAnalysis} disabled={!transcript || !conceptName || isAnalyzing} className="w-full" size="lg">
            {isAnalyzing ? <Loader2 className="mr-2 animate-spin" /> : <Wand2 className="mr-2" />}
            {isAnalyzing ? 'Generating Report...' : 'Analyze My Explanation'}
        </Button>
      </CardFooter>
    </Card>
  );
}
