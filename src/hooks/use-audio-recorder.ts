'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * use-audio-recorder.ts
 * Browser-native Web Speech API with:
 * 1. Audio chime/tone on start so user knows EXACTLY when mic is hot.
 * 2. 0 to length full iteration of event.results so NO early words are ever missed or dropped.
 * 3. Auto-reconnection on Chrome silence disconnects while user is still in recording mode.
 * 4. TypeScript-safe browser globals.
 */

// Play a subtle, pleasant 659Hz beep when mic is truly live
function playMicReadyChime() {
  try {
    if (typeof window === 'undefined') return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(659.25, ctx.currentTime);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // AudioContext blocked or unsupported, fail silently
  }
}

interface AudioRecorderState {
  isRecording: boolean;
  isConnecting: boolean;
  transcript: string;
  errorMessage: string | null;
  startRecording: () => void;
  stopRecording: () => void;
  resetTranscript: () => void;
  clearError: () => void;
  isSupported: boolean;
}

export function useAudioRecorder(): AudioRecorderState {
  const [isRecording, setIsRecording] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const isIntentActiveRef = useRef(false);
  const fullTranscriptRef = useRef('');

  const isSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const initRecognition = useCallback(() => {
    if (!isSupported || typeof window === 'undefined') return null;

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-IN';

    recognition.onstart = () => {
      setIsConnecting(false);
      setIsRecording(true);
      setErrorMessage(null);
      playMicReadyChime();
    };

    recognition.onresult = (event: any) => {
      let finalSegment = '';
      let interimSegment = '';

      // Loop through all results from index 0 to length so early words are never missed
      for (let i = 0; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          finalSegment += res[0].transcript + ' ';
        } else {
          interimSegment += res[0].transcript;
        }
      }

      const combined = (finalSegment + interimSegment).trim();
      fullTranscriptRef.current = combined;
      setTranscript(combined);
    };

    recognition.onerror = (event: any) => {
      console.warn('Speech recognition notice:', event.error);

      if (event.error === 'not-allowed') {
        isIntentActiveRef.current = false;
        setIsRecording(false);
        setIsConnecting(false);
        setErrorMessage(
          'Microphone permission denied. Please allow microphone access in your browser or type your explanation manually.'
        );
      } else if (event.error === 'no-speech') {
        // No speech detected for a short pause. Don't crash.
      } else if (event.error === 'network') {
        setErrorMessage('Network connection lost for speech recognition. Retrying...');
      }
    };

    recognition.onend = () => {
      if (isIntentActiveRef.current) {
        try {
          recognition.start();
        } catch {
          setIsRecording(false);
          setIsConnecting(false);
        }
      } else {
        setIsRecording(false);
        setIsConnecting(false);
      }
    };

    return recognition;
  }, [isSupported]);

  const startRecording = useCallback(() => {
    setErrorMessage(null);

    if (!isSupported) {
      setErrorMessage(
        'Speech recognition is not supported in this browser. Please use Chrome or Edge, or type your explanation directly.'
      );
      return;
    }

    fullTranscriptRef.current = '';
    setTranscript('');
    isIntentActiveRef.current = true;
    setIsConnecting(true);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }

    const recognition = initRecognition();
    if (!recognition) return;

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (e: any) {
      console.error('Failed to start recognition:', e);
      setIsConnecting(false);
      isIntentActiveRef.current = false;
      setErrorMessage('Could not initialize microphone. Please check permissions or type your explanation.');
    }
  }, [isSupported, initRecognition]);

  const stopRecording = useCallback(() => {
    isIntentActiveRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setIsRecording(false);
    setIsConnecting(false);
  }, []);

  const resetTranscript = useCallback(() => {
    fullTranscriptRef.current = '';
    setTranscript('');
    setErrorMessage(null);
  }, []);

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isIntentActiveRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, []);

  return {
    isRecording,
    isConnecting,
    transcript,
    errorMessage,
    startRecording,
    stopRecording,
    resetTranscript,
    clearError,
    isSupported,
  };
}
