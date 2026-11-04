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
    };
  }, [
    writtenAnswers,
    spokenAnswers,
    finalSummarySpeech,
    textQuestions,
    voiceQuestions,
    finalAnalysis,
    isAnalyzing,
  ]);

  // Proctoring & Session Integrity:
  // Minimizing screen or switching tabs auto-submits practice session immediately
  useEffect(() => {
    const handleVisibilityChange = () => {
      const state = stateRef.current;
      if (state.finalAnalysis || state.isAnalyzing) return;

      if (document.hidden && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
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
    if (finalSummarySpeech.trim().length === 0) {
      toast({
        title: "Answer Required",
        description: "Please provide your final overall summary before analyzing performance. It cannot be left blank.",
        variant: "destructive"
      });
      return;
    }

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
  
  const isNextDisabled = currentQuestionIndex === totalSteps - 1;

  return (
    <div className="space-y-8">
      {/* Proctoring & Integrity Notice */}
      <div className="flex items-center gap-2 p-3 text-xs rounded-lg border border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400">
        <ShieldAlert className="w-4 h-4 shrink-0" />
        <span>
          <strong>Proctoring Integrity Active:</strong> Do not minimize the window or switch browser tabs. Leaving this screen will automatically submit your session for immediate evaluation.
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Practice Section</CardTitle>
          <CardDescription>
            {isFinalStep 
              ? "Final step! Show off what you learned."
              : "Answer the first few questions by typing, and the remaining questions by speaking out loud."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isWrittenQuestion ? (
            <QuestionDisplay
              question={questions[currentQuestionIndex]}
              answer={writtenAnswers[currentQuestionIndex]}
              onAnswerChange={handleWrittenAnswerChange}
            />
          ) : isVoiceQuestion ? (
             <div className="space-y-4">
               <div className="space-y-2">
                 <p className="text-sm font-medium text-primary">Voice Question</p>
                 <h3 className="text-xl font-semibold">{questions[currentQuestionIndex].question}</h3>
               </div>
               <SpeechRecorder 
                 key={`voice-${currentQuestionIndex}`}
                 transcript={spokenAnswers[currentQuestionIndex - splitIndex]} 
                 setTranscript={handleSpokenAnswerChange} 
                 isStandalone={false} 
               />
             </div>
          ) : (
             <div className="space-y-4">
               <SpeechRecorder 
                 key="final-summary"
                 transcript={finalSummarySpeech} 
                 setTranscript={setFinalSummarySpeech} 
                 isStandalone={false} 
                 timeLimitSeconds={120}
                 customLabel="Grab Your Confidence!"
                 customDescription="Speak about the whole topic. Explain whatever you understood continuously for up to 2 minutes. Don't leave this blank!"
               />
             </div>
          )}
          
          <div className="flex justify-between items-center pt-4 border-t">
            <div className="w-[100px]"></div>
            <p className="text-sm text-muted-foreground">
              Step {currentQuestionIndex + 1} of {totalSteps}
            </p>
            {isFinalStep ? (
              <Button onClick={handleTriggerAnalysis} disabled={isAnalyzing}>
                {isAnalyzing ? <Loader2 className="mr-2 animate-spin" /> : <BrainCircuit className="mr-2" />}
                {isAnalyzing ? "Analyzing..." : "Analyze My Performance"}
              </Button>
            ) : (
              <Button onClick={handleNext} disabled={isNextDisabled}>
                Next <ArrowRight className="ml-2" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
