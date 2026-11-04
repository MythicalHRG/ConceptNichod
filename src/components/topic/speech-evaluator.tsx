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
}

export function SpeechRecorder({
  transcript,
  setTranscript,
  isStandalone = true,
  timeLimitSeconds,
  customLabel,
  customDescription,
}: SpeechRecorderProps) {
  const [timeLeft, setTimeLeft] = useState(timeLimitSeconds || 0);
  const [localText, setLocalText] = useState(transcript || "");
  const { toast } = useToast();

  const {
    isRecording,
    isConnecting,
    transcript: liveTranscript,
    errorMessage,
    startRecording,
    stopRecording,
    isSupported,
  } = useAudioRecorder();

  // Sync live speech recognition into parent transcript and local textarea
  useEffect(() => {
    if (liveTranscript) {
      setLocalText(liveTranscript);
      setTranscript(liveTranscript);
    }
  }, [liveTranscript, setTranscript]);

  // Keep localText synced with external transcript changes (e.g. step changes)
  useEffect(() => {
    if (transcript !== localText && !isRecording) {
      setLocalText(transcript);
    }
  }, [transcript]);

  // Countdown timer when recording
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording && timeLimitSeconds) {
      interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            stopRecording();
            toast({
              title: "Time Limit Reached",
              description: "Your speech recording has completed.",
            });
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setTimeLeft(timeLimitSeconds || 0);
    }
    return () => clearInterval(interval);
  }, [isRecording, timeLimitSeconds, stopRecording, toast]);

  const handleManualEdit = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setLocalText(text);
    setTranscript(text);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const cardContent = (
    <div className="space-y-4">
      {errorMessage && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border rounded-xl bg-card">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {isConnecting && (
              <span className="flex items-center gap-1.5 text-xs text-amber-600 font-semibold animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Initializing mic... Wait 1 second
              </span>
            )}
            {!isConnecting && isRecording && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                Listening... Speak your answer now
              </span>
            )}
            {!isConnecting && !isRecording && (
              <span className="text-xs text-muted-foreground">
                {isSupported ? "Native Web Speech API ready." : "Web Speech unavailable. Please type below."}
              </span>
            )}
          </div>

          {timeLimitSeconds && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
              <Timer className="w-3.5 h-3.5" />
              <span>Time Remaining: {formatTime(timeLeft)}</span>
            </div>
          )}
        </div>

        <Button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isConnecting}
          variant={isRecording ? "destructive" : "default"}
          className="gap-2 shrink-0"
        >
          {isConnecting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isRecording ? (
            <MicOff className="w-4 h-4" />
          ) : (
            <Mic className="w-4 h-4" />
          )}
          {isConnecting ? "Starting Mic..." : isRecording ? "Stop Recording" : "Start Spoken Answer"}
        </Button>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Answer Transcript (Speak or Type / Edit Manually):
        </label>
        <Textarea
          rows={5}
          placeholder="Your spoken words will appear here in real-time, or you can type directly..."
          value={localText}
          onChange={handleManualEdit}
          disabled={isRecording}
          className="font-sans text-base leading-relaxed"
        />
      </div>
    </div>
  );

  if (!isStandalone) {
    return cardContent;
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl font-bold font-headline">
          {customLabel || "Speech Evaluator"}
        </CardTitle>
        <CardDescription>
          {customDescription || "Record your spoken answer using your microphone or edit your transcript directly."}
        </CardDescription>
      </CardHeader>
      <CardContent>{cardContent}</CardContent>
    </Card>
  );
}
