"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mic, MicOff, Loader2, Timer, AlertCircle, RotateCcw } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SpeechRecorderProps {
  transcript: string;
  setTranscript: (transcript: string) => void;
  isStandalone?: boolean;
  timeLimitSeconds?: number;
  customLabel?: string;
  customDescription?: string;
  isLocked?: boolean;
}

export function SpeechRecorder({
  transcript,
  setTranscript,
  isStandalone = true,
  timeLimitSeconds,
  customLabel,
  customDescription,
  isLocked = false,
}: SpeechRecorderProps) {
  const [timeLeft, setTimeLeft] = useState(timeLimitSeconds || 0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const hasRecordedRef = useRef(false);
  const { toast } = useToast();

  const {
    isRecording,
    isConnecting,
    isLocked: recorderIsLocked,
    transcript: liveTranscript,
    errorMessage,
    startRecording,
    stopRecording,
    lockAndAbort,
    resetTranscript,
    isSupported,
  } = useAudioRecorder();

  // Abort and lock audio recording if parent requests lock
  useEffect(() => {
    if (isLocked) {
      lockAndAbort();
    }
  }, [isLocked, lockAndAbort]);

  // Sync live transcribed speech directly to parent state only after recording starts
  // so previously hydrated/saved transcripts are never wiped to "" on mount.
  useEffect(() => {
    if (isRecording) {
      hasRecordedRef.current = true;
    }
    if (!isLocked && !recorderIsLocked && (hasRecordedRef.current || liveTranscript.length > 0)) {
      setTranscript(liveTranscript);
    }
  }, [liveTranscript, isRecording, setTranscript, isLocked, recorderIsLocked]);

  // Timer: Countdown when timeLimitSeconds is provided, or stopwatch counting up
  useEffect(() => {
    if (!isRecording) {
      if (timeLimitSeconds) setTimeLeft(timeLimitSeconds);
      return;
    }

    const interval = setInterval(() => {
      if (timeLimitSeconds) {
        setTimeLeft((prev) => Math.max(0, prev - 1));
      } else {
        setElapsedTime((prev) => prev + 1);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isRecording, timeLimitSeconds]);

  // Side-effect handler when countdown reaches 0 (never call stopRecording/toast inside setState updater)
  useEffect(() => {
    if (isRecording && timeLimitSeconds && timeLeft === 0) {
      stopRecording();
      toast({
        title: "Time's up!",
        description: "Recording has been automatically completed.",
      });
    }
  }, [isRecording, timeLimitSeconds, timeLeft, stopRecording, toast]);

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      if (!isSupported) {
        toast({
          variant: "destructive",
          title: "Microphone Notice",
          description: "Microphone voice input is optimized for modern browsers (Chrome, Edge, Safari).",
        });
        return;
      }
      hasRecordedRef.current = true;
      if (timeLimitSeconds) {
        setTimeLeft(timeLimitSeconds);
      } else {
        setElapsedTime(0);
      }
      startRecording();
    }
  };

  const handleReset = () => {
    hasRecordedRef.current = false;
    resetTranscript();
    setTranscript("");
    if (timeLimitSeconds) {
      setTimeLeft(timeLimitSeconds);
    } else {
      setElapsedTime(0);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const buttonText = isConnecting
    ? "Starting Mic..."
    : isRecording
    ? "Finish Speaking"
    : "Start Speaking";

  const buttonIcon = isConnecting ? (
    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
  ) : isRecording ? (
    <MicOff className="mr-2 h-4 w-4" />
  ) : (
    <Mic className="mr-2 h-4 w-4" />
  );

  const displayTime = timeLimitSeconds !== undefined ? timeLeft : elapsedTime;

  const content = (
    <div className="space-y-4">
      {errorMessage && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {/* Speech Control Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 items-center">
        <Button
          type="button"
          onClick={toggleRecording}
          size="lg"
          className={`w-full h-12 text-sm sm:text-base font-bold transition-all shadow-md ${
            isRecording
              ? "bg-rose-600 hover:bg-rose-700 text-white animate-pulse"
              : "bg-gradient-to-r from-amber-500 to-primary text-primary-foreground hover:opacity-95"
          }`}
          disabled={isConnecting || isLocked || recorderIsLocked}
        >
          {buttonIcon}
          {buttonText}
        </Button>

        {/* Live Stopwatch / Countdown Timer */}
        <div
          className={`flex items-center justify-center gap-2 font-mono text-base sm:text-lg h-12 px-3 rounded-xl border transition-all ${
            isRecording
              ? timeLimitSeconds && timeLeft <= 15
                ? "bg-rose-500/10 border-rose-500/30 text-rose-500 animate-pulse font-bold"
                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-500 font-bold"
              : "bg-muted/50 border-border text-muted-foreground"
          }`}
        >
          <Timer className={`h-5 w-5 ${isRecording ? "animate-spin text-emerald-500" : ""}`} />
          <span>{formatTime(displayTime)}</span>
          {timeLimitSeconds && (
            <span className="text-xs text-muted-foreground font-sans">
              / {formatTime(timeLimitSeconds)}
            </span>
          )}
        </div>

        {/* Reset button */}
        <Button
          type="button"
          onClick={handleReset}
          size="lg"
          variant="outline"
          className="w-full h-12 text-sm font-semibold border-border/80 hover:bg-muted"
          disabled={isLocked || recorderIsLocked}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Clear & Re-record
        </Button>
      </div>

      {/* Strictly read-only voice transcript display - no typing */}
      <div className="space-y-1.5">
        <div className="relative">
          <Textarea
            placeholder="Your verbal explanation will appear here in real-time as you speak..."
            value={transcript}
            readOnly={true}
            rows={5}
            className={`p-3.5 sm:p-4 rounded-xl text-base leading-relaxed cursor-default select-text resize-none focus-visible:ring-0 transition-colors ${
              isRecording
                ? "border-emerald-500/40 bg-emerald-500/5"
                : "bg-muted/40 border-border/70"
            }`}
          />
          {isRecording && (
            <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-500 text-[10px] font-bold font-mono animate-pulse">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>LIVE LISTENING</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground px-1 font-mono">
          <span>{transcript.trim().split(/\s+/).filter(Boolean).length} words spoken</span>
          {isRecording ? (
            <span className="text-emerald-500 font-semibold">Microphone active • Speak clearly</span>
          ) : (
            <span>Tap Start Speaking when ready</span>
          )}
        </div>
      </div>
    </div>
  );

  if (!isStandalone) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium text-primary">
            {customLabel || "Verbal Concept Delivery"}
          </p>
          <h3 className="text-xl font-semibold">
            {customDescription ||
              "Explain this concept out loud in your own words. Click Start Speaking and articulate your response clearly."}
          </h3>
        </div>
        {content}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">
          {customLabel || "Verbal Concept Delivery"}
        </CardTitle>
        <CardDescription>
          {customDescription ||
            "Explain this concept out loud in your own words. Click Start Speaking and articulate your response clearly."}
        </CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
