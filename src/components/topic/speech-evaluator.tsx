"use client";

import { useState, useEffect } from "react";
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

  // Sync live transcribed speech directly to parent state when not locked
  useEffect(() => {
    if (!isLocked && !recorderIsLocked && liveTranscript !== undefined) {
      setTranscript(liveTranscript);
    }
  }, [liveTranscript, setTranscript, isLocked, recorderIsLocked]);

  // Timer: Countdown when timeLimitSeconds is provided, or stopwatch counting up
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        if (timeLimitSeconds) {
          setTimeLeft((prev) => {
            if (prev <= 1) {
              clearInterval(interval);
              stopRecording();
              toast({
                title: "Time's up!",
                description: "Recording has been automatically completed.",
              });
              return 0;
            }
            return prev - 1;
          });
        } else {
          setElapsedTime((prev) => prev + 1);
        }
      }, 1000);
    } else if (!isRecording && timeLimitSeconds) {
      setTimeLeft(timeLimitSeconds);
    }
    return () => clearInterval(interval);
  }, [isRecording, timeLimitSeconds, stopRecording, toast]);

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
      if (timeLimitSeconds) {
        setTimeLeft(timeLimitSeconds);
      } else {
        setElapsedTime(0);
      }
      startRecording();
    }
  };

  const handleReset = () => {
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

      <div className="flex items-center gap-3 flex-wrap justify-between sm:justify-start">
        <Button
          type="button"
          onClick={toggleRecording}
          size="lg"
          className="w-full sm:w-auto"
          variant={isRecording ? "destructive" : "default"}
          disabled={isConnecting || isLocked || recorderIsLocked}
        >
          {buttonIcon}
          {buttonText}
        </Button>

        {/* Reset button - no pause button per specification */}
        <Button
          type="button"
          onClick={handleReset}
          size="lg"
          variant="outline"
          className="w-full sm:w-auto"
          disabled={isLocked || recorderIsLocked}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset
        </Button>

        {/* Live Stopwatch / Countdown Timer */}
        <div
          className={`flex items-center gap-2 font-mono text-lg px-3 py-1.5 rounded-lg border ${
            isRecording
              ? timeLimitSeconds && timeLeft <= 15
                ? "bg-destructive/10 border-destructive/30 text-destructive animate-pulse"
                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
              : "bg-muted/40 border-border text-muted-foreground"
          }`}
        >
          <Timer className={`h-5 w-5 ${isRecording ? "animate-pulse" : ""}`} />
          <span>{formatTime(displayTime)}</span>
        </div>
      </div>

      {/* Strictly read-only voice transcript display - no typing */}
      <Textarea
        placeholder="Your verbal explanation will appear here in real-time as you speak..."
        value={transcript}
        readOnly={true}
        rows={5}
        className="bg-muted/40 text-base cursor-default select-text resize-none focus-visible:ring-0"
      />
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
