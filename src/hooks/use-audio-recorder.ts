'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient, LiveClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { useToast } from './use-toast';
import { getDeepgramSessionKey } from '@/app/actions';

export const useAudioRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  
  const recognitionRef = useRef<LiveClient | null>(null);
  const microphoneRef = useRef<MediaRecorder | null>(null);
  const { toast } = useToast();

  const isRecordingRef = useRef(isRecording);
  isRecordingRef.current = isRecording;

  const setupDeepgram = useCallback(async () => {
    try {
      const sessionKey = await getDeepgramSessionKey();

      if (!sessionKey || !sessionKey.key) {
        throw new Error("Failed to get a session key from the server.");
      }

      const deepgram = createClient(sessionKey.key);
      const recognition = deepgram.listen.live({
        model: 'nova-2',
        interim_results: true,
        smart_format: true,
        language: 'en-US',
      });

      recognition.on(LiveTranscriptionEvents.Open, () => {
        setIsConnecting(false);
      });
      
      recognition.on(LiveTranscriptionEvents.Transcript, (data) => {
        const currentTranscript = data.channel.alternatives[0].transcript;
        if (currentTranscript) {
          setTranscript(prev => prev + " " + currentTranscript);
        }
        if (data.is_final && currentTranscript.trim()) {
             setFinalTranscript(prev => (prev + " " + currentTranscript).trim());
        }
      });
      
       recognition.on(LiveTranscriptionEvents.Close, () => {
        setIsConnecting(false);
        if (isRecordingRef.current) {
            setIsRecording(false);
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
        setIsRecording(false);
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
    }
  }, [toast]);
  
  useEffect(() => {
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
  }, [setupDeepgram]);

  const setupMicrophone = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const microphone = new MediaRecorder(stream);
        microphone.ondataavailable = (event) => {
            if (event.data.size > 0 && recognitionRef.current?.getReadyState() === 1) {
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

  const startRecording = async () => {
    if (isRecording) return;
    
    if (!recognitionRef.current || recognitionRef.current.getReadyState() > 1) {
      setIsConnecting(true);
      await setupDeepgram();
    }

    const micReady = await setupMicrophone();
    if (!micReady) return;

    if (microphoneRef.current && recognitionRef.current && recognitionRef.current.getReadyState() === 1) {
      setTranscript("");
      setFinalTranscript("");
      microphoneRef.current.start(500);
      setIsRecording(true);
    } else {
      toast({ variant: "destructive", title: "Cannot Record", description: "Transcription service is not ready."});
    }
  };

  const stopRecording = () => {
    if (!isRecording) return;

    if (microphoneRef.current?.state === 'recording') {
        microphoneRef.current.stop();
        if (microphoneRef.current.stream) {
            microphoneRef.current.stream.getTracks().forEach((track: any) => track.stop());
        }
    }
    if (recognitionRef.current?.getReadyState() === 1) {
        recognitionRef.current.finish();
    }
    setIsRecording(false);
  };

  return { isRecording, isConnecting, transcript: finalTranscript, startRecording, stopRecording };
};
