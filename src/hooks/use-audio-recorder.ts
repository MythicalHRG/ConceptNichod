'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * use-audio-recorder.ts
 * Browser-native Web Speech API with Pause/Resume, Reset, Chime, and Lock/Abort defense
 */

// Subtle mic chime when recording begins
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

export interface AudioRecorderState {
  isRecording: boolean;
  isPaused: boolean;
  isConnecting: boolean;
  isLocked: boolean;
  transcript: string;
  errorMessage: string | null;
  startRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => void;
  lockAndAbort: () => void;
  resetTranscript: () => void;
  clearError: () => void;
  isSupported: boolean;
}

export function useAudioRecorder(): AudioRecorderState {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const isIntentActiveRef = useRef(false);
  const isPausedRef = useRef(false);
  const isLockedRef = useRef(false);
  const baseTranscriptRef = useRef('');
  const fullTranscriptRef = useRef('');
  const restartCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const initRecognition = useCallback(() => {
    if (!isSupported || typeof window === 'undefined' || isLockedRef.current) return null;

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-IN';

    recognition.onstart = () => {
      if (isLockedRef.current) return;
      setIsConnecting(false);
      setIsRecording(true);
      setIsPaused(false);
      setErrorMessage(null);
      playMicReadyChime();
    };

    recognition.onresult = (event: any) => {
      if (isLockedRef.current) return;
      restartCountRef.current = 0;
      let finalSegment = '';
      let interimSegment = '';

      for (let i = 0; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          finalSegment += res[0].transcript + ' ';
        } else {
          interimSegment += res[0].transcript;
        }
      }

      const prefix = baseTranscriptRef.current ? baseTranscriptRef.current + ' ' : '';
      const combined = (prefix + finalSegment + interimSegment).trim();
      fullTranscriptRef.current = combined;
      setTranscript(combined);
    };

    recognition.onerror = (event: any) => {
      if (isLockedRef.current) return;
      console.warn('Speech recognition notice:', event.error);

      if (event.error === 'not-allowed') {
        isIntentActiveRef.current = false;
        setIsRecording(false);
        setIsPaused(false);
        setIsConnecting(false);
        setErrorMessage(
          'Microphone permission denied. Please allow microphone access in your browser settings.'
        );
      } else if (event.error === 'no-speech') {
        // No speech detected during pause; the browser may continue the session.
      } else if (event.error === 'network') {
        setErrorMessage('Speech recognition connection interrupted. Reconnecting with a bounded retry policy...');
      }
    };

    recognition.onend = () => {
      if (isLockedRef.current || isPausedRef.current || !isIntentActiveRef.current) {
        setIsRecording(false);
        setIsConnecting(false);
        return;
      }

      restartCountRef.current += 1;
      if (restartCountRef.current > 5) {
        isIntentActiveRef.current = false;
        setIsRecording(false);
        setIsConnecting(false);
        setErrorMessage('Speech recognition could not reconnect. Press Start Speaking to try again.');
        return;
      }

      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      const retryDelay = Math.min(250 * (2 ** (restartCountRef.current - 1)), 4000);
      setIsRecording(false);
      setIsConnecting(true);
      retryTimeoutRef.current = setTimeout(() => {
        retryTimeoutRef.current = null;
        if (isLockedRef.current || isPausedRef.current || !isIntentActiveRef.current) {
          setIsConnecting(false);
          return;
        }
        try {
          recognition.start();
        } catch (error) {
          isIntentActiveRef.current = false;
          setIsRecording(false);
          setIsConnecting(false);
          setErrorMessage('Speech recognition could not restart. Press Start Speaking to try again.');
          console.warn('Speech recognition restart failed:', error);
        }
      }, retryDelay);
    };

    return recognition;
  }, [isSupported]);

  const startRecording = useCallback(() => {
    if (isLockedRef.current) return;
    setErrorMessage(null);

    if (!isSupported) {
      setErrorMessage(
        'Speech recognition is not supported in this browser. Please use Chrome or Edge.'
      );
      return;
    }

    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    retryTimeoutRef.current = null;
    restartCountRef.current = 0;
    baseTranscriptRef.current = '';
    fullTranscriptRef.current = '';
    setTranscript('');
    isIntentActiveRef.current = true;
    isPausedRef.current = false;
    setIsPaused(false);
    setIsConnecting(true);

    if (recognitionRef.current) {
      const previousRecognition = recognitionRef.current;
      recognitionRef.current = null;
      previousRecognition.onstart = null;
      previousRecognition.onresult = null;
      previousRecognition.onerror = null;
      previousRecognition.onend = null;
      try {
        if (typeof previousRecognition.abort === 'function') previousRecognition.abort();
        else previousRecognition.stop();
      } catch {}
    }

    let recognition: any = null;
    try {
      recognition = initRecognition();
    } catch (error) {
      isIntentActiveRef.current = false;
      setIsConnecting(false);
      setErrorMessage('Speech recognition is unavailable in this browser.');
      console.warn('Speech recognition initialization failed:', error);
      return;
    }
    if (!recognition) {
      isIntentActiveRef.current = false;
      setIsConnecting(false);
      setErrorMessage('Speech recognition is unavailable in this browser.');
      return;
    }

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (e: any) {
      console.error('Failed to start recognition:', e);
      setIsConnecting(false);
      isIntentActiveRef.current = false;
      setErrorMessage('Could not initialize microphone. Please check permissions.');
    }
  }, [isSupported, initRecognition]);

  const pauseRecording = useCallback(() => {
    if (isLockedRef.current || !isRecording || isPaused) return;
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    retryTimeoutRef.current = null;
    isPausedRef.current = true;
    setIsPaused(true);
    baseTranscriptRef.current = fullTranscriptRef.current;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
  }, [isRecording, isPaused]);

  const resumeRecording = useCallback(() => {
    if (isLockedRef.current || !isRecording || !isPaused) return;
    isPausedRef.current = false;
    setIsPaused(false);
    setIsConnecting(true);

    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    retryTimeoutRef.current = null;
    restartCountRef.current = 0;
    let recognition: any = null;
    try {
      recognition = initRecognition();
    } catch (error) {
      setIsConnecting(false);
      setErrorMessage('Speech recognition is unavailable in this browser.');
      console.warn('Speech recognition initialization failed:', error);
      return;
    }
    if (!recognition) {
      setIsConnecting(false);
      setErrorMessage('Speech recognition is unavailable in this browser.');
      return;
    }

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      console.error('Failed to resume recognition:', e);
      setIsConnecting(false);
    }
  }, [isRecording, isPaused, initRecognition]);

  const stopRecording = useCallback(() => {
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    retryTimeoutRef.current = null;
    isIntentActiveRef.current = false;
    isPausedRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setIsRecording(false);
    setIsPaused(false);
    setIsConnecting(false);
  }, []);

  const lockAndAbort = useCallback(() => {
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    retryTimeoutRef.current = null;
    isLockedRef.current = true;
    setIsLocked(true);
    isIntentActiveRef.current = false;
    isPausedRef.current = false;

    if (recognitionRef.current) {
      try {
        const rec = recognitionRef.current;
        rec.onstart = null;
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        if (typeof rec.abort === 'function') {
          rec.abort();
        } else if (typeof rec.stop === 'function') {
          rec.stop();
        }
      } catch (err) {
        console.warn('Speech recognition abort notice:', err);
      }
      recognitionRef.current = null;
    }

    setIsRecording(false);
    setIsPaused(false);
    setIsConnecting(false);
  }, []);

  const resetTranscript = useCallback(() => {
    if (isLockedRef.current) return;
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    retryTimeoutRef.current = null;
    restartCountRef.current = 0;
    isIntentActiveRef.current = false;
    isPausedRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    baseTranscriptRef.current = '';
    fullTranscriptRef.current = '';
    setTranscript('');
    setIsRecording(false);
    setIsPaused(false);
    setIsConnecting(false);
    setErrorMessage(null);
  }, []);

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
      isLockedRef.current = true;
      isIntentActiveRef.current = false;
      isPausedRef.current = false;
      if (recognitionRef.current) {
        try {
          const rec = recognitionRef.current;
          rec.onstart = null;
          rec.onresult = null;
          rec.onerror = null;
          rec.onend = null;
          if (typeof rec.abort === 'function') {
            rec.abort();
          } else if (typeof rec.stop === 'function') {
            rec.stop();
          }
        } catch {}
        recognitionRef.current = null;
      }
    };
  }, []);

  return {
    isRecording,
    isPaused,
    isConnecting,
    isLocked,
    transcript,
    errorMessage,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    lockAndAbort,
    resetTranscript,
    clearError,
    isSupported,
  };
}
