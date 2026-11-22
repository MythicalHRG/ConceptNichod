"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Topic } from "@/lib/types";
import { Loader2, ArrowRight, BrainCircuit, ShieldAlert } from "lucide-react";
import { QuestionDisplay } from "./question-section";
import { SpeechRecorder } from "./speech-evaluator";
import { FinalAnalysisDisplay } from "./final-analysis-display";
import { FollowUpChat } from "./follow-up-chat";
import type { FinalAnalysisOutput } from "@/ai/flows/analyze-answers";
import { LatexRenderer } from "@/components/ui/latex-renderer";
import { useToast } from "@/hooks/use-toast";

interface PracticeAndAnalysisSectionProps {
  topic: Topic;
  onFinalAnalysis: (
    writtenAnswers: { question: string; answer: string }[],
    spokenAnswers: { question: string; answer: string }[],
    isAutoSubmit?: boolean
  ) => void;
  isAnalyzing: boolean;
  finalAnalysis: FinalAnalysisOutput | null;
}

const getViolationKey = (topicId?: string) =>
  topicId ? `cn_proctor_violation_${topicId}` : "";

export function PracticeAndAnalysisSection({
  topic,
  onFinalAnalysis,
  isAnalyzing,
  finalAnalysis,
}: PracticeAndAnalysisSectionProps) {
  const { toast } = useToast();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const questions = Array.isArray(topic.questions) ? topic.questions : [];

  const splitIndex = Math.ceil(questions.length / 2);
  const textQuestions = questions.slice(0, splitIndex);
  const voiceQuestions = questions.slice(splitIndex);

  const [writtenAnswers, setWrittenAnswers] = useState<string[]>(() =>
    Array.from({ length: textQuestions.length }, (_, i) => topic.savedWrittenAnswers?.[i] || "")
  );
  const [spokenAnswers, setSpokenAnswers] = useState<string[]>(() =>
    Array.from({ length: voiceQuestions.length }, (_, i) => topic.savedSpokenAnswers?.[i] || "")
  );
  const [finalSummarySpeech, setFinalSummarySpeech] = useState<string>("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  const totalSteps = questions.length + 1; // +1 for the final overall summary step
  const autoSubmittedRef = useRef(false);
  const pendingViolationRef = useRef(false);
  const enteredFullscreenRef = useRef(false);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep latest answers in a ref to avoid re-binding proctoring listeners on every keystroke/speech update
  const stateRef = useRef({
    writtenAnswers,
    spokenAnswers,
    finalSummarySpeech,
    textQuestions,
    voiceQuestions,
    finalAnalysis,
    isAnalyzing,
    isSubmitted,
    topicId: topic.id,
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
      topicId: topic.id,
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
    topic.id,
  ]);

  // Release the local submission lock when the parent analysis request fails.
  // The parent owns isAnalyzing and clears it in finally; without this reset,
  // the button remains permanently disabled after a network/AI failure.
  useEffect(() => {
    if (isSubmitted && !isAnalyzing && !finalAnalysis) {
      setIsSubmitted(false);
      autoSubmittedRef.current = false;
    }
  }, [isSubmitted, isAnalyzing, finalAnalysis]);

  const triggerProctoringAutoSubmit = useCallback(
    (reasonText: string) => {
      const state = stateRef.current;
      if (state.finalAnalysis || state.isAnalyzing || state.isSubmitted) return;
      if (autoSubmittedRef.current) return;

      autoSubmittedRef.current = true;
      pendingViolationRef.current = true;
      setIsSubmitted(true);

      const violationKey = getViolationKey(state.topicId);
      if (violationKey && typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem(violationKey, "1");
        } catch {}
      }

      toast({
        title: "Session Auto-Submitted",
        description: reasonText,
        variant: "destructive",
      });

      const formattedWrittenAnswers = state.textQuestions.map((q, i) => ({
        question: q.question,
        answer: state.writtenAnswers[i]?.trim()
          ? state.writtenAnswers[i]
          : "[Auto-submitted: Unanswered due to proctoring violation / exit]",
      }));
      const formattedSpokenAnswers = state.voiceQuestions.map((q, i) => ({
        question: q.question,
        answer: state.spokenAnswers[i]?.trim()
          ? state.spokenAnswers[i]
          : "[Auto-submitted: Unanswered due to proctoring violation / exit]",
      }));

      formattedSpokenAnswers.push({
        question: "Overall Topic Summary (2-Minute Challenge)",
        answer: state.finalSummarySpeech?.trim()
          ? state.finalSummarySpeech
          : "[Auto-submitted: Session terminated due to proctoring violation / exit]",
      });

      // Persist in_progress snapshot so even if the mobile OS kills the background tab,
      // reloading or returning forces immediate automatic submission.
      if (state.topicId) {
        import("@/app/actions")
          .then(({ updateTopicProgressAction }) => {
            updateTopicProgressAction(
              state.topicId as string,
              "in_progress",
              state.writtenAnswers,
              state.spokenAnswers
            ).catch(() => {});
          })
          .catch(() => {});
      }

      onFinalAnalysis(formattedWrittenAnswers, formattedSpokenAnswers, true);
    },
    [onFinalAnalysis, toast]
  );

  // Strict Active Session Proctoring:
  // Auto-submits immediately on tab switch / minimize (visibilitychange),
  // leaving or closing the tab / app switch (pagehide, beforeunload),
  // browser Back navigation (popstate), exiting fullscreen (fullscreenchange / webkitfullscreenchange),
  // or split-screen / Alt+Tab window focus loss (window blur).
  // Also blocks copy/cut/paste/contextmenu during the active test.
  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") return;

    const getFullscreenEl = () =>
      document.fullscreenElement || (document as any).webkitFullscreenElement || null;

    if (getFullscreenEl()) {
      enteredFullscreenRef.current = true;
    }

    // If a prior violation was recorded in this tab before an OS freeze/reload, enforce immediately
    const violationKey = getViolationKey(stateRef.current.topicId);
    if (violationKey && !stateRef.current.finalAnalysis) {
      try {
        if (window.sessionStorage.getItem(violationKey) === "1") {
          triggerProctoringAutoSubmit(
            "A previous exit/tab-switch violation was detected. Submitting your test automatically."
          );
          return;
        }
      } catch {}
    }

    // Push a guard history state only for an active, incomplete practice session.
    if (!stateRef.current.finalAnalysis) {
      try {
        window.history.pushState({ cnProctorGuard: true }, "", window.location.href);
      } catch {}
    }

    const handleVisibilityChange = () => {
      const state = stateRef.current;
      if (state.finalAnalysis) return;

      if (document.hidden || document.visibilityState === "hidden") {
        triggerProctoringAutoSubmit(
          "Window minimization or tab switch detected. Test session has been automatically submitted for evaluation."
        );
      } else if (
        document.visibilityState === "visible" &&
        pendingViolationRef.current &&
        !state.isAnalyzing &&
        !state.finalAnalysis
      ) {
        // Mobile OS froze or aborted the background fetch while minimized — enforce immediately on return
        autoSubmittedRef.current = false;
        triggerProctoringAutoSubmit(
          "Your practice session was interrupted when you left the tab. Submitting now for evaluation."
        );
      }
    };

    const handlePageHide = () => {
      if (stateRef.current.finalAnalysis) return;
      triggerProctoringAutoSubmit(
        "Leaving or closing the test screen detected. Test session has been automatically submitted."
      );
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (stateRef.current.finalAnalysis) return;
      triggerProctoringAutoSubmit(
        "Attempting to exit or reload during an active test triggers automatic submission."
      );
      e.preventDefault();
      e.returnValue = "";
    };

    const handlePopState = () => {
      if (stateRef.current.finalAnalysis) return;
      try {
        window.history.pushState({ cnProctorGuard: true }, "", window.location.href);
      } catch {}
      triggerProctoringAutoSubmit(
        "Browser Back navigation detected during an active test. Submitting automatically."
      );
    };

    const handleFullscreenChange = () => {
      if (getFullscreenEl()) {
        enteredFullscreenRef.current = true;
      } else if (
        enteredFullscreenRef.current &&
        !stateRef.current.finalAnalysis &&
        !stateRef.current.isAnalyzing
      ) {
        enteredFullscreenRef.current = false;
        triggerProctoringAutoSubmit(
          "Exiting fullscreen mode during an active test triggers automatic submission."
        );
      }
    };

    const handleWindowBlur = () => {
      if (stateRef.current.finalAnalysis || stateRef.current.isAnalyzing) return;
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
      // 1.2s grace avoids false triggers on one-time browser mic permission dialogs
      // while catching Alt+Tab, split-screen, and switching to another app/window.
      blurTimeoutRef.current = setTimeout(() => {
        blurTimeoutRef.current = null;
        if (!document.hasFocus() && !stateRef.current.finalAnalysis && !stateRef.current.isAnalyzing) {
          triggerProctoringAutoSubmit(
            "Window focus lost (Alt+Tab / split-screen / app switch). Test session automatically submitted."
          );
        }
      }, 1200);
    };

    const handleWindowFocus = () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
        blurTimeoutRef.current = null;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (stateRef.current.finalAnalysis) return;
      if (e.key === "Escape" && enteredFullscreenRef.current) {
        triggerProctoringAutoSubmit(
          "Escape / exiting fullscreen detected during an active test. Submitting automatically."
        );
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
        blurTimeoutRef.current = null;
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [triggerProctoringAutoSubmit]);

  const handleBlockedClipboard = (e: React.ClipboardEvent) => {
    e.preventDefault();
    toast({
      variant: "destructive",
      title: "Proctoring Policy",
      description: "Copy, cut, and paste are disabled during active tests. Please write your own reasoning.",
    });
  };

  const handleWrittenAnswerChange = (answer: string) => {
    setWrittenAnswers((prev) => {
      const next = [...prev];
      next[currentQuestionIndex] = answer;
      return next;
    });
  };

  const handleSpokenAnswerChange = (answer: string) => {
    const voiceIdx = currentQuestionIndex - splitIndex;
    setSpokenAnswers((prev) => {
      const next = [...prev];
      next[voiceIdx] = answer;
      return next;
    });
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
        variant: "destructive",
      });
      return;
    }

    if (currentQuestionIndex < totalSteps - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);

      // Save partial progress to DB for anti-cheating
      if (topic.id) {
        import("@/app/actions").then(({ updateTopicProgressAction }) => {
          updateTopicProgressAction(topic.id as string, "in_progress", writtenAnswers, spokenAnswers).catch(console.error);
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
        variant: "destructive",
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

    onFinalAnalysis(formattedWrittenAnswers, formattedSpokenAnswers, false);
  };

  if (finalAnalysis) {
    return (
      <div className="space-y-6 min-w-0 max-w-full overflow-x-hidden">
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

  if (questions.length === 0) {
    return (
      <Card className="border border-border/80 shadow-sm">
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          No practice questions are available for this topic yet.
        </CardContent>
      </Card>
    );
  }

  const isWrittenQuestion = currentQuestionIndex < splitIndex;
  const isVoiceQuestion = currentQuestionIndex >= splitIndex && currentQuestionIndex < questions.length;
  const isFinalStep = currentQuestionIndex === questions.length;

  const isLocked = isAnalyzing || isSubmitted;
  const isNextDisabled = currentQuestionIndex === totalSteps - 1 || isLocked;

  const percentComplete = Math.round(((currentQuestionIndex + 1) / totalSteps) * 100);

  return (
    <div
      className="space-y-5 sm:space-y-6 min-w-0 max-w-full overflow-x-hidden select-none"
      onPaste={handleBlockedClipboard}
      onCopy={handleBlockedClipboard}
      onCut={handleBlockedClipboard}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Proctoring & Integrity Notice */}
      <div className="flex items-center gap-2 p-3 text-xs rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
        <ShieldAlert className="w-4 h-4 shrink-0" />
        <span className="leading-relaxed">
          <strong>Strict Proctoring Active:</strong> Do not exit fullscreen, switch tabs/apps, press Back, split-screen, or paste answers. Any exit attempt immediately auto-submits your test for grading.
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

        <CardContent className="p-4 sm:p-6 space-y-6 min-w-0 overflow-hidden">
          {isWrittenQuestion ? (
            <QuestionDisplay
              question={questions[currentQuestionIndex]}
              answer={writtenAnswers[currentQuestionIndex] || ""}
              onAnswerChange={handleWrittenAnswerChange}
              disabled={isLocked}
            />
          ) : isVoiceQuestion ? (
            <div className="space-y-4 min-w-0">
              <div className="p-4 sm:p-5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-1.5 min-w-0 overflow-hidden">
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                  Verbal Articulation Question
                </p>
                <div className="text-base sm:text-lg md:text-xl font-semibold text-foreground leading-relaxed break-words min-w-0 overflow-hidden">
                  <LatexRenderer content={questions[currentQuestionIndex].question} />
                </div>
              </div>
              <SpeechRecorder
                key={`voice-${currentQuestionIndex}`}
                transcript={spokenAnswers[currentQuestionIndex - splitIndex] || ""}
                setTranscript={handleSpokenAnswerChange}
                isStandalone={false}
                isLocked={isLocked}
              />
            </div>
          ) : (
            <div className="space-y-4 min-w-0">
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
