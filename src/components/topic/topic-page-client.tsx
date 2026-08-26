"use client";

import { useState, useEffect } from "react";
import { generateContentAction, runFinalAnalysisAction, deleteTopicAction, markSummaryViewedAction, updateTopicProgressAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast";
import type { Topic } from "@/lib/types";
import { Loader2, Wand2, Trash2, Timer, Play } from "lucide-react";
import { PracticeAndAnalysisSection } from "./practice-analysis-section";
import { SummaryDisplay } from "./summary-display";
import type { FinalAnalysisOutput } from "@/ai/flows/analyze-answers";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { revalidateDashboard } from "@/app/actions";

type TopicPageClientProps = {
  topicId: string;
  initialTopic: Topic;
};

export function TopicPageClient({ topicId, initialTopic }: TopicPageClientProps) {
  const [topic, setTopic] = useState<Topic>(initialTopic);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [finalAnalysis, setFinalAnalysis] = useState<FinalAnalysisOutput | null>(topic.analysis || null);
  
  const initialShouldBePractice = initialTopic.practiceStatus === 'completed' || 
                                  initialTopic.analysis || 
                                  initialTopic.practiceStatus === 'in_progress' || 
                                  initialTopic.summaryViewed;
                                  
  const [isPracticing, setIsPracticing] = useState(!!initialShouldBePractice);
  const [isShaking, setIsShaking] = useState(false);

  const [activeTab, setActiveTab] = useState(initialShouldBePractice ? "practice" : "summary");
  const [timerState, setTimerState] = useState<'idle' | 'running' | 'completed'>('idle');
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [customTime, setCustomTime] = useState<string>("");

  const { toast } = useToast();
  const router = useRouter();

  // If initialTopic changes via Server Component re-render
  useEffect(() => {
    setTopic(initialTopic);
    setFinalAnalysis(initialTopic.analysis || null);
    
    // Anti-Cheating: Check practice status on reload
    if (initialTopic.practiceStatus === 'completed' || initialTopic.analysis) {
       setActiveTab('practice');
       setIsPracticing(true);
    } else if (initialTopic.practiceStatus === 'in_progress') {
       setActiveTab('practice');
       setIsPracticing(true);
       handleAutoSubmit(initialTopic);
    } else if (initialTopic.summaryViewed) {
       setActiveTab('practice');
       setIsPracticing(true);
    }
  }, [initialTopic]);

  const handleAutoSubmit = async (currentTopic: Topic) => {
      if (!currentTopic.questions) return;
      
      const numQuestions = currentTopic.questions.length;
      const splitIndex = Math.ceil(numQuestions / 2);
      
      const writtenAnswers = currentTopic.questions.slice(0, splitIndex).map((q, i) => ({
          question: q.question,
          answer: currentTopic.savedWrittenAnswers?.[i] || "Abandoned"
      }));

      const spokenAnswers = currentTopic.questions.slice(splitIndex).map((q, i) => ({
          question: q.question,
          answer: currentTopic.savedSpokenAnswers?.[i] || "Abandoned"
      }));

      toast({
          variant: "destructive",
          title: "Session Restored",
          description: "You reloaded the page during a test. Your partial answers have been automatically submitted."
      });
      
      await handleFinalAnalysis(writtenAnswers, spokenAnswers, true);
  };

  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (isPracticing && !finalAnalysis) {
        document.body.classList.add('test-in-progress');
      } else {
        document.body.classList.remove('test-in-progress');
      }
    }
    return () => {
      if (typeof document !== 'undefined') document.body.classList.remove('test-in-progress');
    };
  }, [isPracticing, finalAnalysis]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timerState === 'running' && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining((prev) => prev - 1);
      }, 1000);
    } else if (timerState === 'running' && timeRemaining <= 0) {
      setTimerState('completed');
      setActiveTab('practice');
      handleTabChange('practice');
    }
    return () => clearInterval(interval);
  }, [timerState, timeRemaining]);

  const startTimer = (minutes: number) => {
    setTimeRemaining(minutes * 60);
    setTimerState('running');
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === 'practice' && !isPracticing) {
      setIsPracticing(true);
      setIsShaking(true);
      
      // Request Fullscreen
      if (typeof document !== 'undefined' && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(err => console.log("Fullscreen blocked:", err));
      }

      // Anti-Cheating: Mark summary as viewed so they can't go back on reload
      markSummaryViewedAction(topicId).catch(console.error);

      if (typeof window !== "undefined" && window.navigator.vibrate) {
        window.navigator.vibrate([100, 30, 100, 30, 100]);
      }

      try {
        const utterance = new SpeechSynthesisUtterance("You have moved to the Questions section. Now you have to answer the questions.");
        utterance.lang = 'en-US';
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.error("Speech synthesis failed.", e);
      }
      
      setTimeout(() => setIsShaking(false), 820);
    }
  };

  const handleGenerateContent = async () => {
    if (!topic?.name || !topic.classLevel) return;
    setIsGenerating(true);
    try {
      const response = await fetch('/api/generate/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId, topicName: topic.name, classLevel: topic.classLevel }),
      });
      if (!response.ok) throw new Error("Failed to generate content");
      const generated = await response.json();
      setTopic(prev => ({ ...prev, ...generated }));
      toast({
        title: "Content Generated!",
        description: "Your summary and questions are ready.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Generation Failed",
        description: "Could not generate content. Please try again.",
      });
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleDeleteTopic = async () => {
    setIsDeleting(true);
    try {
        await deleteTopicAction(topicId);
        toast({
            title: "Topic Deleted",
            description: `"${topic?.name}" has been permanently removed.`,
        });
        router.push('/dashboard');
    } catch (error) {
        console.error("Deletion Error:", error);
        toast({
            variant: "destructive",
            title: "Deletion Failed",
            description: "Could not delete the topic. Please try again.",
        });
    } finally {
        setIsDeleting(false);
    }
  };

  const handleFinalAnalysis = async (writtenAnswers: { question: string; answer: string }[], spokenAnswers: { question: string; answer: string }[], isAutoSubmit = false) => {
    if (!topic?.name || !topic.classLevel || !topic.summary) {
        toast({ variant: "destructive", title: "Analysis Failed", description: "Missing topic data to perform analysis." });
        return;
    }
    setIsAnalyzing(true);
    try {
        const response = await fetch('/api/generate/analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topicName: topic.name,
            classLevel: topic.classLevel,
            summary: topic.summary,
            writtenAnswers,
            spokenAnswers,
            topicId
          }),
        });
        if (!response.ok) throw new Error("Analysis failed");
        const { analysis } = await response.json();

        setFinalAnalysis(analysis);
        setTopic(prev => ({ ...prev, analysis }));
        
        toast({ 
          title: "Analysis Complete!", 
          description: `Your performance review is ready.` 
        });

    } catch (error: any) {
        toast({
            variant: "destructive",
            title: "Analysis Failed",
            description: error.message || "Could not analyze your performance. Please try again.",
        });
    } finally {
        setIsAnalyzing(false);
        // Exit Fullscreen
        if (typeof document !== 'undefined' && document.fullscreenElement) {
            document.exitFullscreen().catch(err => console.log("Failed to exit fullscreen:", err));
        }
    }
  };

  if (!topic) {
    return <div className="flex justify-center items-center h-[calc(100vh-8rem)]"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  if (!topic.summary) {
    return (
      <Card className="text-center">
        <CardHeader>
          <CardTitle className="font-headline text-3xl">{topic.name}</CardTitle>
          <CardDescription className="text-base text-muted-foreground">
            {topic.classLevel} &bull; {topic.subject} &bull; {topic.chapter}
          </CardDescription>
          <CardDescription className="pt-4">
            Ready to master this concept? Let's generate your learning materials.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleGenerateContent} disabled={isGenerating}>
            {isGenerating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="mr-2 h-4 w-4" />
            )}
            {isGenerating ? "Generating..." : "Generate Summary & Questions"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn(isShaking && 'shake')}>
      {!(isPracticing && !finalAnalysis) && (
        <div className="flex justify-between items-start mb-1">
          <div className="flex-1">
              <h1 className="text-4xl font-headline font-bold">{topic.name}</h1>
              <p className="text-lg text-muted-foreground mb-6">
                  {topic.classLevel} &bull; {topic.subject} &bull; {topic.chapter}
              </p>
          </div>
        </div>
      )}
      
      <Tabs value={activeTab} className="w-full" onValueChange={handleTabChange}>
        {!(isPracticing && !finalAnalysis) && (
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="summary" disabled={!finalAnalysis && (isPracticing || topic.summaryViewed)}>Summary</TabsTrigger>
            <TabsTrigger value="practice">Practice & Analysis</TabsTrigger>
          </TabsList>
        )}
        <TabsContent value="summary">
          {topic.summary && timerState === 'idle' && !finalAnalysis && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Timer className="w-5 h-5"/> How much time do you need?</CardTitle>
                <CardDescription>Select a timer to complete reading the summary.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4 items-center">
                   <Button onClick={() => startTimer(2)}>2 Minutes</Button>
                   <Button onClick={() => startTimer(5)}>5 Minutes</Button>
                   <Button onClick={() => startTimer(10)}>10 Minutes</Button>
                   <div className="flex items-center gap-2 ml-4">
                      <Input 
                        type="number" 
                        min="1" 
                        max="15" 
                        value={customTime} 
                        onChange={(e) => setCustomTime(e.target.value)} 
                        placeholder="Custom (max 15)" 
                        className="w-32"
                      />
                      <Button variant="outline" onClick={() => {
                        const mins = parseInt(customTime);
                        if (mins > 0 && mins <= 15) startTimer(mins);
                        else toast({ title: "Invalid Time", description: "Enter a number between 1 and 15.", variant: "destructive" });
                      }}>Start</Button>
                   </div>
                </div>
              </CardContent>
            </Card>
          )}

          {topic.summary && timerState === 'running' && !finalAnalysis && (
             <div className="mb-6 p-4 bg-primary/10 rounded-lg flex items-center justify-between sticky top-4 z-10 backdrop-blur-md border border-primary/20 shadow-sm">
                <div className="flex items-center gap-3">
                  <Timer className="w-6 h-6 text-primary animate-pulse" />
                  <span className="text-2xl font-bold text-primary font-mono">
                    {Math.floor(timeRemaining / 60).toString().padStart(2, '0')}:{(timeRemaining % 60).toString().padStart(2, '0')}
                  </span>
                </div>
                <Button onClick={() => {
                  setTimerState('completed');
                  setActiveTab('practice');
                  handleTabChange('practice');
                }} variant="default">
                  Skip & Start Practice <Play className="w-4 h-4 ml-2" />
                </Button>
             </div>
          )}

          {topic.summary && (timerState !== 'idle' || finalAnalysis) && <SummaryDisplay summary={topic.summary} />}
        </TabsContent>
        <TabsContent value="practice">
          {topic.questions && (
            <PracticeAndAnalysisSection 
              topic={topic}
              onFinalAnalysis={handleFinalAnalysis}
              isAnalyzing={isAnalyzing}
              finalAnalysis={finalAnalysis}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
