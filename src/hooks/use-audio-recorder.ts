'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * use-audio-recorder.ts
 * Uses the browser's built-in Web Speech API (SpeechRecognition).
 * No API keys needed. Works in Chrome, Edge, Safari.
 * Falls back gracefully if the browser does not support it.
 */

interface AudioRecorderState {
  isRecording: boolean;
  isConnecting: boolean;
  transcript: string;
  startRecording: () => void;
  stopRecording: () => void;
  resetTranscript: () => void;
  isSupported: boolean;
}

export function useAudioRecorder(): AudioRecorderState {
  const [isRecording, setIsRecording] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalTranscriptRef = useRef('');

  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const initRecognition = useCallback(() => {
    if (!isSupported) return null;

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    const recognition: SpeechRecognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-IN'; // Indian English for better accuracy

    recognition.onstart = () => {
      setIsConnecting(false);
      setIsRecording(true);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';
      let newFinalTranscript = finalTranscriptRef.current;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          newFinalTranscript += result[0].transcript + ' ';
          finalTranscriptRef.current = newFinalTranscript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      setTranscript(newFinalTranscript + interimTranscript);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      setIsRecording(false);
      setIsConnecting(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
      setIsConnecting(false);
    };

    return recognition;
  }, [isSupported]);

  const startRecording = useCallback(() => {
    if (!isSupported) {
      alert('Speech recognition is not supported in your browser. Please use Chrome or Edge.');
      return;
    }

    finalTranscriptRef.current = '';
    setTranscript('');
    setIsConnecting(true);

    const recognition = initRecognition();
    if (!recognition) return;

    recognitionRef.current = recognition;
    
    try {
      recognition.start();
    } catch (e) {
      console.error('Failed to start recognition:', e);
      setIsConnecting(false);
    }
  }, [isSupported, initRecognition]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const resetTranscript = useCallback(() => {
    finalTranscriptRef.current = '';
    setTranscript('');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  return {
    isRecording,
    isConnecting,
    transcript,
    startRecording,
    stopRecording,
    resetTranscript,
    isSupported,
  };
}
