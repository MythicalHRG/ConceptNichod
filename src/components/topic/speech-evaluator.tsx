"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mic, MicOff, Loader2, Timer, AlertCircle } from "lucide-react";
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
  const { toast } = useToast();

  const {
    isRecording,
    isPaused,
    isConnecting,
    isLocked: recorderIsLocked,
    transcript: liveTranscript,
    errorMessage,
    startRecording,
    pauseRecording,
    resumeRecording,
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

  // Countdown timer when recording and not paused
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording && !isPaused && timeLimitSeconds) {
      interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            stopRecording();
            toast({
              title: "Time's up!",
              description: "Recording has been automatically stopped.",
            });
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (!isRecording) {
      setTimeLeft(timeLimitSeconds || 0);
    }
    return () => clearInterval(interval);
  }, [isRecording, isPaused, timeLimitSeconds, stopRecording, toast]);

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      if (!isSupported) {
        toast({
          variant: "destructive",
          title: "Browser Unsupported",
          description: "Speech recognition is not supported in this browser. Please use Chrome or Edge.",
        });
        return;
      }
      setTimeLeft(timeLimitSeconds || 0);
      startRecording();
    }
  };

  const togglePause = () => {
    if (isPaused) {
      resumeRecording();
    } else {
      pauseRecording();
    }
  };

  const handleReset = () => {
    resetTranscript();
    setTranscript("");
    setTimeLeft(timeLimitSeconds || 0);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const buttonText = isConnecting
    ? "Connecting..."
    : isRecording
    ? "Stop"
    : "Start";

  const buttonIcon = isConnecting ? (
    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
  ) : isRecording ? (
    <MicOff className="mr-2 h-4 w-4" />
  ) : (
    <Mic className="mr-2 h-4 w-4" />
  );

  const content = (
    <div className="space-y-4">
      {errorMessage && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-4 flex-wrap">
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

        {isRecording && (
          <Button
            type="button"
            onClick={togglePause}
            size="lg"
            variant="secondary"
            className="w-full sm:w-auto"
            disabled={isLocked || recorderIsLocked}
          >
            {isPaused ? "Resume" : "Pause"}
          </Button>
        )}

        <Button
          type="button"
          onClick={handleReset}
          size="lg"
          variant="outline"
          className="w-full sm:w-auto"
          disabled={isLocked || recorderIsLocked}
        >
          Reset
        </Button>

        {timeLimitSeconds !== undefined && (
          <div
            className={`flex items-center gap-2 font-mono text-xl ${
              isRecording && !isPaused && timeLeft <= 15
                ? "text-destructive animate-pulse"
                : "text-primary"
            } ${isPaused ? "opacity-50" : ""}`}
          >
            <Timer className="h-6 w-6" />
            {formatTime(timeLeft)}
          </div>
        )}
      </div>

      <Textarea
        placeholder="Your speech transcript will appear here..."
        value={transcript}
        readOnly={true}
        rows={5}
        className="bg-muted text-base cursor-not-allowed"
      />
    </div>
  );

  if (!isStandalone) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium text-primary">
            {customLabel || "Verbal Summary"}
          </p>
          <h3 className="text-xl font-semibold">
            {customDescription ||
              "Summarize the topic out loud in your own words. Click start, speak, and then click stop. Your transcript will appear below."}
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
          {customLabel || "2. Verbal Summary"}
        </CardTitle>
        <CardDescription>
          {customDescription ||
            "Summarize the topic out loud in your own words. Click start, speak, and then click stop. Your transcript will appear below."}
        </CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
