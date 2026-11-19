"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Topic } from "@/lib/types";
import { Loader2, ArrowLeft, ArrowRight, BrainCircuit, ShieldAlert } from "lucide-react";
import { QuestionDisplay } from "./question-section";
import { SpeechRecorder } from "./speech-evaluator";
import { FinalAnalysisDisplay } from "./final-analysis-display";
import { FollowUpChat } from "./follow-up-chat";
import type { FinalAnalysisOutput } from "@/ai/flows/analyze-answers";
import { LatexRenderer } from "@/components/ui/latex-renderer";
import { useToast } from "@/hooks/use-toast";

interface PracticeAndAnalysisSectionProps {
  topic: Topic;
  onFinalAnalysis: (writtenAnswers: { question: string; answer: string }[], spokenAnswers: { question: string; answer: string }[]) => void;
  isAnalyzing: boolean;
  finalAnalysis: FinalAnalysisOutput | null;
}

export function PracticeAndAnalysisSection({ topic, onFinalAnalysis, isAnalyzing, finalAnalysis }: PracticeAndAnalysisSectionProps) {
  const { toast } = useToast();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const questions = topic.questions || [];
  
  const splitIndex = Math.ceil(questions.length / 2);
  const textQuestions = questions.slice(0, splitIndex);
  const voiceQuestions = questions.slice(splitIndex);

  const [writtenAnswers, setWrittenAnswers] = useState<string[]>(() => Array(textQuestions.length).fill(""));
  const [spokenAnswers, setSpokenAnswers] = useState<string[]>(() => Array(voiceQuestions.length).fill(""));
  const [finalSummarySpeech, setFinalSummarySpeech] = useState<string>("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  const totalSteps = questions.length + 1; // +1 for the final overall summary step
  const autoSubmittedRef = useRef(false);

  // Keep latest answers in a ref to avoid re-binding visibilitychange on every keystroke/speech update
  const stateRef = useRef({
    writtenAnswers,
    spokenAnswers,
    finalSummarySpeech,
    textQuestions,
    voiceQuestions,
    finalAnalysis,
    isAnalyzing,
    isSubmitted,
  });

  useEffect(() => {
    stateRef.current = {
      writtenAnswers,
      spokenAnswers,
      finalSummarySpeech,
      textQuestions,
      voiceQuestions,
      finalAnalysis,
      isAnalyzing,
      isSubmitted,
    };
  }, [
    writtenAnswers,
    spokenAnswers,
    finalSummarySpeech,
    textQuestions,
    voiceQuestions,
    finalAnalysis,
    isAnalyzing,
    isSubmitted,
  ]);

  // Release the local submission lock when the parent analysis request fails.
  // The parent owns isAnalyzing and clears it in finally; without this reset,
  // the button remains permanently disabled after a network/AI failure.
  useEffect(() => {
    if (isSubmitted && !isAnalyzing && !finalAnalysis) {
      setIsSubmitted(false);
    }
  }, [isSubmitted, isAnalyzing, finalAnalysis]);

  // Proctoring & Session Integrity:
  // Minimizing screen or switching tabs auto-submits practice session immediately
  useEffect(() => {
    const handleVisibilityChange = () => {
      const state = stateRef.current;
      if (state.finalAnalysis || state.isAnalyzing || state.isSubmitted) return;

      if (document.hidden && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        setIsSubmitted(true);
        toast({
          title: "Session Auto-Submitted",
          description: "Window minimization or tab switch detected. Test session has been automatically submitted for evaluation.",
          variant: "destructive",
        });

        const formattedWrittenAnswers = state.textQuestions.map((q, i) => ({
          question: q.question,
          answer: state.writtenAnswers[i]?.trim()
            ? state.writtenAnswers[i]
            : "[Auto-submitted: Unanswered due to window minimize / tab-switch]",
        }));
        const formattedSpokenAnswers = state.voiceQuestions.map((q, i) => ({
          question: q.question,
          answer: state.spokenAnswers[i]?.trim()
            ? state.spokenAnswers[i]
            : "[Auto-submitted: Unanswered due to window minimize / tab-switch]",
        }));

        formattedSpokenAnswers.push({
          question: "Overall Topic Summary (2-Minute Challenge)",
          answer: state.finalSummarySpeech?.trim()
            ? state.finalSummarySpeech
            : "[Auto-submitted: Session terminated due to window minimize / tab-switch]",
        });

        onFinalAnalysis(formattedWrittenAnswers, formattedSpokenAnswers);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [onFinalAnalysis, toast]);

  const handleWrittenAnswerChange = (answer: string) => {
    const newAnswers = [...writtenAnswers];
    newAnswers[currentQuestionIndex] = answer;
    setWrittenAnswers(newAnswers);
  };

  const handleSpokenAnswerChange = (answer: string) => {
    const newAnswers = [...spokenAnswers];
    newAnswers[currentQuestionIndex - splitIndex] = answer;
    setSpokenAnswers(newAnswers);
  };

  const handleNext = () => {
    const isWrittenQuestion = currentQuestionIndex < splitIndex;
    const isVoiceQuestion = currentQuestionIndex >= splitIndex && currentQuestionIndex < questions.length;
    const isFinalStep = currentQuestionIndex === questions.length;

    let answer = "";
    if (isWrittenQuestion) {
      answer = writtenAnswers[currentQuestionIndex] || "";
    } else if (isVoiceQuestion) {
      answer = spokenAnswers[currentQuestionIndex - splitIndex] || "";
    } else if (isFinalStep) {
      answer = finalSummarySpeech || "";
    }
    
    if (answer.trim().length === 0) {
      toast({
        title: "Answer Required",
        description: "Please provide an answer to proceed. Answers cannot be left blank.",
        variant: "destructive"
      });
      return;
    }

    if (currentQuestionIndex < totalSteps - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      
      // Save partial progress to DB for anti-cheating
      if (topic.id) {
        import("@/app/actions").then(({ updateTopicProgressAction }) => {
          updateTopicProgressAction(topic.id as string, 'in_progress', writtenAnswers, spokenAnswers).catch(console.error);
        });
      }
    }
  };

  const handleTriggerAnalysis = () => {
    if (isAnalyzing || isSubmitted) return;

    if (finalSummarySpeech.trim().length === 0) {
      toast({
        title: "Answer Required",
        description: "Please provide your final overall summary before analyzing performance. It cannot be left blank.",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitted(true);

    const formattedWrittenAnswers = textQuestions.map((q, i) => ({
      question: q.question,
      answer: writtenAnswers[i] || "No answer provided.",
    }));
    const formattedSpokenAnswers = voiceQuestions.map((q, i) => ({
      question: q.question,
      answer: spokenAnswers[i] || "No answer provided.",
    }));
    
    formattedSpokenAnswers.push({
      question: "Overall Topic Summary (2-Minute Challenge)",
      answer: finalSummarySpeech,
    });

    onFinalAnalysis(formattedWrittenAnswers, formattedSpokenAnswers);
  };

  if (finalAnalysis) {
    return (
      <div className="space-y-6">
        <FinalAnalysisDisplay analysis={finalAnalysis} topicName={topic.name} />
        <FollowUpChat 
          topicName={topic.name} 
          topicSummary={topic.summary || ""} 
          classLevel={topic.classLevel || "General"} 
          subject={topic.subject || "General"} 
        />
      </div>
    );
  }
  
  const isWrittenQuestion = currentQuestionIndex < splitIndex;
  const isVoiceQuestion = currentQuestionIndex >= splitIndex && currentQuestionIndex < questions.length;
  const isFinalStep = currentQuestionIndex === questions.length;
  
  const isLocked = isAnalyzing || isSubmitted;
  const isNextDisabled = currentQuestionIndex === totalSteps - 1 || isLocked;

  const percentComplete = Math.round(((currentQuestionIndex + 1) / totalSteps) * 100);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Proctoring & Integrity Notice */}
      <div className="flex items-center gap-2 p-3 text-xs rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
        <ShieldAlert className="w-4 h-4 shrink-0" />
        <span className="leading-relaxed">
          <strong>Proctoring Active:</strong> Do not minimize the window or switch tabs. Leaving this screen will immediately submit partial progress for grading.
        </span>
      </div>

      <Card className="border border-border/80 shadow-sm overflow-hidden">
        {/* Visual Multi-Step Progress Header */}
        <div className="p-4 sm:p-5 border-b border-border/60 bg-muted/20 space-y-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-bold text-foreground flex items-center gap-1.5">
              {isWrittenQuestion ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  <span>Stage 1: Written Questions</span>
                </>
              ) : isVoiceQuestion ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Stage 2: Verbal Articulation</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span>Stage 3: 2-Minute Oral Defense</span>
                </>
              )}
            </span>

            <span className="font-mono text-muted-foreground font-semibold">
              Step {currentQuestionIndex + 1} of {totalSteps} ({percentComplete}%)
            </span>
          </div>

          {/* Stepper Progress Bar */}
          <div className="w-full h-2 rounded-full bg-muted/80 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-primary transition-all duration-300"
              style={{ width: `${percentComplete}%` }}
            />
          </div>
        </div>

        <CardContent className="p-4 sm:p-6 space-y-6">
          {isWrittenQuestion ? (
            <QuestionDisplay
              question={questions[currentQuestionIndex]}
              answer={writtenAnswers[currentQuestionIndex]}
              onAnswerChange={handleWrittenAnswerChange}
              disabled={isLocked}
            />
          ) : isVoiceQuestion ? (
             <div className="space-y-4">
               <div className="p-4 sm:p-5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-1.5">
                 <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                   Verbal Articulation Question
                 </p>
                 <div className="text-base sm:text-lg md:text-xl font-semibold text-foreground leading-relaxed break-words">
                   <LatexRenderer content={questions[currentQuestionIndex].question} />
                 </div>
               </div>
               <SpeechRecorder 
                 key={`voice-${currentQuestionIndex}`}
                 transcript={spokenAnswers[currentQuestionIndex - splitIndex]} 
                 setTranscript={handleSpokenAnswerChange} 
                 isStandalone={false} 
                 isLocked={isLocked}
               />
             </div>
          ) : (
             <div className="space-y-4">
               <SpeechRecorder 
                 key="final-summary"
                 transcript={finalSummarySpeech} 
                 setTranscript={setFinalSummarySpeech} 
                 isStandalone={false} 
                 isLocked={isLocked}
                 timeLimitSeconds={120}
                 customLabel="Grab Your Confidence!"
                 customDescription="Speak about the whole topic. Explain whatever you understood continuously for up to 2 minutes. Don't leave this blank!"
               />
             </div>
          )}
          
          {/* Navigation Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-border/60">
            <div className="text-xs text-muted-foreground font-mono hidden sm:block">
              Question {currentQuestionIndex + 1} of {totalSteps}
            </div>

            <div className="w-full sm:w-auto">
              {isFinalStep ? (
                <Button 
                  onClick={handleTriggerAnalysis} 
                  disabled={isLocked}
                  className="w-full sm:w-auto h-11 px-6 text-sm font-bold bg-gradient-to-r from-rose-500 via-amber-500 to-primary text-primary-foreground hover:opacity-95 shadow-md gap-2"
                >
                  {isLocked ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BrainCircuit className="mr-2 h-4 w-4" />}
                  {isLocked ? "Grading Performance..." : "Analyze My Performance"}
                </Button>
              ) : (
                <Button 
                  onClick={handleNext} 
                  disabled={isNextDisabled}
                  className="w-full sm:w-auto h-11 px-6 text-sm font-bold gap-2"
                >
                  <span>Next Question</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
