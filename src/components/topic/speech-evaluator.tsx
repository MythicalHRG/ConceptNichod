"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mic, MicOff, Loader2, Timer } from "lucide-react";
import { Textarea } from "../ui/textarea";
import { createClient, LiveClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { getDeepgramSessionKey } from '@/app/actions';

interface SpeechRecorderProps {
    transcript: string;
    setTranscript: (transcript: string) => void;
    isStandalone?: boolean;
    timeLimitSeconds?: number;
    customLabel?: string;
    customDescription?: string;
}

export function SpeechRecorder({ transcript, setTranscript, isStandalone = true, timeLimitSeconds, customLabel, customDescription }: SpeechRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [timeLeft, setTimeLeft] = useState(timeLimitSeconds || 0);
  
  const recognitionRef = useRef<LiveClient | null>(null);
  const microphoneRef = useRef<MediaRecorder | null>(null);
  const { toast } = useToast();

  const isRecordingRef = useRef(isRecording);
  isRecordingRef.current = isRecording;

  const transcriptRef = useRef(transcript);
  useEffect(() => {
      transcriptRef.current = transcript;
  }, [transcript]);

  const setupDeepgram = useCallback(() => {
    return new Promise<void>(async (resolve, reject) => {
      try {
        const sessionKey = await getDeepgramSessionKey();

        if (sessionKey.error) {
          throw new Error(sessionKey.error);
        }

        if (!sessionKey || !sessionKey.key) {
          throw new Error("Failed to get a session key from the server.");
        }

        const deepgram = createClient(sessionKey.key);
        const recognition = deepgram.listen.live({
          model: 'enhanced',
          interim_results: true,
          smart_format: true,
          language: 'en-US',
          keepalive: true, // Boolean, not string
        });

        recognition.on(LiveTranscriptionEvents.Open, () => {
          setIsConnecting(false);
          resolve();
        });
        
        recognition.on(LiveTranscriptionEvents.Transcript, (data) => {
          const transcriptChunk = data.channel.alternatives[0].transcript;
          if (transcriptChunk && data.is_final) {
               const newTranscript = (transcriptRef.current + " " + transcriptChunk).trim();
               transcriptRef.current = newTranscript;
               setTranscript(newTranscript);
          }
        });
        
         recognition.on(LiveTranscriptionEvents.Close, () => {
          setIsConnecting(false);
          if (isRecordingRef.current) {
              setIsRecording(false);
              // Stop the microphone when the connection unexpectedly closes!
              if (microphoneRef.current?.state === 'recording') {
                microphoneRef.current.stop();
                if (microphoneRef.current.stream) {
                  microphoneRef.current.stream.getTracks().forEach((track: any) => track.stop());
                }
              }
          }
        });

        recognition.on(LiveTranscriptionEvents.Error, (error) => {
          console.error('Deepgram error:', error);
          toast({
              variant: "destructive",
              title: "Speech Recognition Error",
              description: "An error occurred with the transcription service."
          });
          setIsConnecting(false);
          if (isRecordingRef.current) {
              setIsRecording(false);
              if (microphoneRef.current?.state === 'recording') {
                microphoneRef.current.stop();
                if (microphoneRef.current.stream) {
                  microphoneRef.current.stream.getTracks().forEach((track: any) => track.stop());
                }
              }
          }
          reject(error);
        });

        recognitionRef.current = recognition;

      } catch (error: any) {
          console.error("Failed to setup Deepgram:", error);
          toast({
              variant: "destructive",
              title: "Initialization Failed",
              description: error.message || "Could not connect to the transcription service."
          });
          setIsConnecting(false);
          reject(error);
      }
    });
  }, [toast]); // Removed setTranscript from deps to prevent re-creation
  
  useEffect(() => {
    // Only run setup once on mount
    setupDeepgram();
    
    return () => {
        if (recognitionRef.current) {
            recognitionRef.current.finish();
        }
        if (microphoneRef.current) {
            microphoneRef.current.stop();
            if (microphoneRef.current.stream) {
              microphoneRef.current.stream.getTracks().forEach((track: any) => track.stop());
            }
        }
    }
  }, []); // Empty deps to strictly run ONCE and avoid connection dropping on re-renders

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording && timeLimitSeconds) {
      interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setTimeLeft(timeLimitSeconds || 0);
    }
    return () => clearInterval(interval);
  }, [isRecording, timeLimitSeconds]);

  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  const setupMicrophone = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const microphone = new MediaRecorder(stream);
        microphone.ondataavailable = (event) => {
            if (event.data.size > 0 && recognitionRef.current?.getReadyState() === 1 && !isPausedRef.current) {
                recognitionRef.current.send(event.data);
            }
        };
        microphoneRef.current = microphone;
        return true;
      } catch (error) {
        console.error("Microphone access error:", error);
        toast({
            variant: "destructive",
            title: "Microphone Access Denied",
            description: "Please allow microphone access in your browser settings."
        });
        return false;
      }
  }

  const toggleRecording = async () => {
    if (isRecording) {
      if (microphoneRef.current?.state === 'recording') {
        microphoneRef.current?.stop();
        if (microphoneRef.current.stream) {
          microphoneRef.current.stream.getTracks().forEach(track => track.stop());
        }
      }
      if (recognitionRef.current?.getReadyState() === 1) {
        recognitionRef.current?.finish();
      }
      setIsRecording(false);
      setIsPaused(false);
    } else {
      // Re-initialize connection if it's closed
      if (!recognitionRef.current || recognitionRef.current.getReadyState() > 1) {
          setIsConnecting(true);
          await setupDeepgram();
      }

      // Setup microphone if not already
      const micReady = await setupMicrophone();
      if (!micReady) return;
      

      if (microphoneRef.current && recognitionRef.current && recognitionRef.current.getReadyState() === 1) {
        microphoneRef.current.start(500); // Start recording and get data every 500ms
        setIsRecording(true);
        setIsPaused(false);
      } else {
        toast({ variant: "destructive", title: "Cannot Record", description: "Transcription service is not ready."});
      }
    }
  };
  
  const togglePause = () => {
      setIsPaused(!isPaused);
  };

  const handleReset = () => {
      setTranscript("");
      transcriptRef.current = "";
      setTimeLeft(timeLimitSeconds || 0);
      if (isRecording) {
          toggleRecording();
      }
  };
  
  useEffect(() => {
      if (timeLeft === 0 && isRecording && timeLimitSeconds && !isPaused) {
          toggleRecording();
          toast({ title: "Time's up!", description: "Recording has been automatically stopped." });
      }
  }, [timeLeft, isRecording, timeLimitSeconds, isPaused]);

  const buttonText = isConnecting ? "Connecting..." : (isRecording ? "Stop" : "Start");
  const buttonIcon = isConnecting ? <Loader2 className="mr-2 animate-spin" /> : (isRecording ? <MicOff className="mr-2" /> : <Mic className="mr-2" />);

  const formatTime = (seconds: number) => {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const content = (
      <div className="space-y-4">
        <div className="flex items-center gap-4 flex-wrap">
          <Button onClick={toggleRecording} size="lg" className="w-full sm:w-auto" variant={isRecording ? "destructive" : "default"} disabled={isConnecting}>
            {buttonIcon}
            {buttonText}
          </Button>
          
          {isRecording && (
              <Button onClick={togglePause} size="lg" variant="secondary" className="w-full sm:w-auto">
                {isPaused ? "Resume" : "Pause"}
              </Button>
          )}

          <Button onClick={handleReset} size="lg" variant="outline" className="w-full sm:w-auto">
              Reset
          </Button>

          {timeLimitSeconds !== undefined && (
              <div className={`flex items-center gap-2 font-mono text-xl ${isRecording && !isPaused && timeLeft <= 15 ? 'text-destructive animate-pulse' : 'text-primary'} ${isPaused ? 'opacity-50' : ''}`}>
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
            className="bg-muted"
        />
      </div>
  );

  if (!isStandalone) {
      return (
        <div className="space-y-4">
            <div className="space-y-2">
                <p className="text-sm font-medium text-primary">{customLabel || "Verbal Summary"}</p>
                <h3 className="text-xl font-semibold">{customDescription || "Summarize the topic out loud in your own words. Click start, speak, and then click stop. Your transcript will appear below."}</h3>
            </div>
            {content}
        </div>
      )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">{customLabel || "2. Verbal Summary"}</CardTitle>
        <CardDescription>
          {customDescription || "Summarize the topic out loud in your own words. Click start, speak, and then click stop. Your transcript will appear below."}
        </CardDescription>
      </CardHeader>
      <CardContent>
          {content}
      </CardContent>
    </Card>
  );
}
