"use client";

import { useState, useEffect } from "react";
import { generateContentAction, runFinalAnalysisAction, markSummaryViewedAction, updateTopicProgressAction } from "@/app/actions";
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
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wand2, Trash2, Timer, Play, ArrowLeft, BookOpen, PenTool, Sparkles, CheckCircle2 } from "lucide-react";
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
    <div className={cn(isShaking && 'shake', "space-y-4 sm:space-y-6 max-w-5xl mx-auto")}>
      {!(isPracticing && !finalAnalysis) && (
        <div className="space-y-3">
          {/* Breadcrumb Navigation to Dashboard */}
          <div className="flex items-center justify-between">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors py-1 px-2 -ml-2 rounded-lg hover:bg-muted/50"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Library</span>
            </Link>

            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Concept Workspace</span>
            </div>
          </div>

          {/* Book / Topic Header */}
          <div className="p-4 sm:p-6 rounded-2xl border border-border/80 bg-card/60 backdrop-blur-md shadow-xs space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary font-bold text-xs px-2.5 py-0.5">
                {topic.subject || "Subject"}
              </Badge>
              {topic.chapter && (
                <Badge variant="outline" className="border-border text-muted-foreground text-xs px-2.5 py-0.5">
                  📖 {topic.chapter}
                </Badge>
              )}
              {topic.classLevel && (
                <Badge variant="outline" className="border-border text-muted-foreground text-xs px-2.5 py-0.5">
                  🎯 {topic.classLevel}
                </Badge>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl md:text-4xl font-headline font-bold text-foreground leading-tight break-words">
              {topic.name}
            </h1>
          </div>
        </div>
      )}
      
      <Tabs value={activeTab} className="w-full space-y-4" onValueChange={handleTabChange}>
        {!(isPracticing && !finalAnalysis) && (
          <TabsList className="grid w-full grid-cols-2 h-12 p-1 bg-muted/70 rounded-xl border border-border/60">
            <TabsTrigger
              value="summary"
              disabled={!finalAnalysis && (isPracticing || topic.summaryViewed)}
              className="gap-2 text-xs sm:text-sm font-semibold rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-xs transition-all"
            >
              <BookOpen className="w-4 h-4 text-primary" />
              <span>Concept Summary</span>
            </TabsTrigger>
            <TabsTrigger
              value="practice"
              className="gap-2 text-xs sm:text-sm font-semibold rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-xs transition-all"
            >
              <PenTool className="w-4 h-4 text-primary" />
              <span>Practice & Analysis</span>
            </TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="summary" className="space-y-6 focus-visible:outline-none">
          {topic.summary && timerState === 'idle' && !finalAnalysis && (
            <Card className="border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-background shadow-xs overflow-hidden">
              <CardHeader className="p-4 sm:p-6 pb-2">
                <div className="flex items-center gap-2 text-primary font-bold text-sm">
                  <Timer className="w-4 h-4" />
                  <span>Choose Your Reading Goal</span>
                </div>
                <CardTitle className="font-headline text-lg sm:text-xl text-foreground">
                  How much time do you want to study this Nichod?
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Setting a timer sharpens active recall. After the timer ends, you'll be transitioned to test your retention.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 pt-2">
                <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-3">
                  <button
                    type="button"
                    onClick={() => startTimer(2)}
                    className="flex flex-col items-center justify-center p-3 rounded-xl border border-border/80 bg-background hover:bg-primary/10 hover:border-primary/50 transition-all text-center group active:scale-95"
                  >
                    <span className="font-bold text-sm sm:text-base text-foreground group-hover:text-primary">2 Mins</span>
                    <span className="text-[10px] text-muted-foreground">Quick Skim</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => startTimer(5)}
                    className="flex flex-col items-center justify-center p-3 rounded-xl border border-primary/40 bg-primary/10 hover:bg-primary/20 transition-all text-center group active:scale-95 shadow-xs"
                  >
                    <span className="font-bold text-sm sm:text-base text-primary">5 Mins</span>
                    <span className="text-[10px] text-primary/80 font-medium">Recommended</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => startTimer(10)}
                    className="flex flex-col items-center justify-center p-3 rounded-xl border border-border/80 bg-background hover:bg-primary/10 hover:border-primary/50 transition-all text-center group active:scale-95"
                  >
                    <span className="font-bold text-sm sm:text-base text-foreground group-hover:text-primary">10 Mins</span>
                    <span className="text-[10px] text-muted-foreground">Deep Read</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-border/60">
                  <Input 
                    type="number" 
                    min="1" 
                    max="15" 
                    value={customTime} 
                    onChange={(e) => setCustomTime(e.target.value)} 
                    placeholder="Custom (1-15 min)" 
                    className="h-9 text-xs sm:text-sm max-w-[160px]"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs"
                    onClick={() => {
                      const mins = parseInt(customTime);
                      if (mins > 0 && mins <= 15) startTimer(mins);
                      else toast({ title: "Invalid Time", description: "Enter a number between 1 and 15.", variant: "destructive" });
                    }}
                  >
                    Start Custom
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {topic.summary && timerState === 'running' && !finalAnalysis && (
            <div className="p-3.5 sm:p-4 bg-background/90 rounded-2xl flex items-center justify-between sticky top-16 z-20 backdrop-blur-xl border border-primary/30 shadow-lg gap-3">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                  <Timer className="w-5 h-5 text-primary animate-pulse" />
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider font-semibold">
                    Reading Window Active
                  </div>
                  <span className="text-xl sm:text-2xl font-bold text-primary font-mono tracking-tight">
                    {Math.floor(timeRemaining / 60).toString().padStart(2, '0')}:{(timeRemaining % 60).toString().padStart(2, '0')}
                  </span>
                </div>
              </div>

              <Button
                size="sm"
                onClick={() => {
                  setTimerState('completed');
                  setActiveTab('practice');
                  handleTabChange('practice');
                }}
                className="h-9 px-3 sm:px-4 text-xs font-bold gap-1.5 shadow-sm shrink-0"
              >
                <span>Ready for Questions</span>
                <Play className="w-3.5 h-3.5 fill-current" />
              </Button>
            </div>
          )}

          {topic.summary && (timerState !== 'idle' || finalAnalysis) && (
            <SummaryDisplay summary={topic.summary} topic={topic} />
          )}
        </TabsContent>

        <TabsContent value="practice" className="focus-visible:outline-none">
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
