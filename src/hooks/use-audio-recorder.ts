'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * use-audio-recorder.ts
 * Browser-native Web Speech API with bounded reconnects, reset, and lock/abort defense
 */

function getSpeechStartErrorMessage(error: unknown): string {
  const name = error && typeof error === "object" && "name" in error
    ? String((error as { name?: unknown }).name || "")
    : "";

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "The browser blocked microphone access. Allow microphone permission for this site, then try again.";
    case "NotSupportedError":
      return "This browser does not provide a speech-recognition service. Try a current version of Chrome or Edge.";
    case "InvalidStateError":
      return "The speech service is already active or changing state. Press Stop, wait a moment, then try again.";
    case "AbortError":
      return "The browser interrupted speech recognition before it could start. Try again.";
    default:
      return "Speech recognition could not start. Check microphone permission and your connection, then try again.";
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
      const code = typeof event?.error === "string" ? event.error : "unknown";
      console.warn("Speech recognition notice:", code);

      const fatalMessages: Record<string, string> = {
        "not-allowed": "Microphone permission was denied. Allow microphone access in your browser and try again.",
        "service-not-allowed": "This browser or device has blocked its speech-recognition service. Try Chrome or Edge with microphone access enabled.",
        "audio-capture": "No usable microphone was found. Check your device microphone and browser permissions.",
        "language-not-supported": "Speech recognition for English (India) is unavailable in this browser. Try another supported browser.",
      };
      const fatalMessage = fatalMessages[code];
      if (fatalMessage) {
        isIntentActiveRef.current = false;
        isPausedRef.current = false;
        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
        setIsRecording(false);
        setIsPaused(false);
        setIsConnecting(false);
        setErrorMessage(fatalMessage);
        return;
      }

      if (code === "no-speech" || code === "aborted") {
        // No speech and intentional aborts are handled by the end/retry state.
        return;
      }
      if (code === "network") {
        setErrorMessage("Speech service connection interrupted. Reconnecting automatically...");
        return;
      }
      setErrorMessage("Speech recognition encountered an unexpected error. Try stopping and starting the microphone again.");
    };

    recognition.onend = () => {
      if (isLockedRef.current || isPausedRef.current || !isIntentActiveRef.current) {
        setIsRecording(false);
        setIsConnecting(false);
        return;
      }

      // Preserve everything spoken before the browser ended/restarted recognition.
      baseTranscriptRef.current = fullTranscriptRef.current;

      restartCountRef.current += 1;
      if (restartCountRef.current > 5) {
        isIntentActiveRef.current = false;
        setIsRecording(false);
        setIsConnecting(false);
        setErrorMessage("Speech recognition could not reconnect after several attempts. Check your connection, then press Start Speaking to try again.");
        return;
      }

      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      const retryDelay = Math.min(250 * (2 ** (restartCountRef.current - 1)), 4000);
      // Keep the active recording clock running during the short browser restart.
      // isConnecting indicates the microphone is temporarily reconnecting.
      setIsRecording(true);
      setIsConnecting(true);
      retryTimeoutRef.current = setTimeout(() => {
        retryTimeoutRef.current = null;
        if (isLockedRef.current || isPausedRef.current || !isIntentActiveRef.current) {
          setIsRecording(false);
          setIsConnecting(false);
          return;
        }
        try {
          recognition.start();
        } catch (error) {
          isIntentActiveRef.current = false;
          setIsRecording(false);
          setIsConnecting(false);
          setErrorMessage("Speech recognition could not restart. Check microphone permissions and try again.");
          console.warn("Speech recognition restart failed:", error);
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
    } catch (error) {
      console.warn("Failed to start speech recognition:", error);
      isIntentActiveRef.current = false;
      isPausedRef.current = false;
      setIsRecording(false);
      setIsPaused(false);
      setIsConnecting(false);
      setErrorMessage(getSpeechStartErrorMessage(error));
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
        recognition.onstart = null;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
      }
      try { recognition.abort?.(); } catch {}
    }
  }, [isSupported, initRecognition]);

  const pauseRecording = useCallback(() => {
    if (isLockedRef.current || !isIntentActiveRef.current || isPausedRef.current) return;
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
  }, []);

  const resumeRecording = useCallback(() => {
    if (isLockedRef.current || !isIntentActiveRef.current || !isPausedRef.current) return;
    isPausedRef.current = false;
    setIsPaused(false);
    setIsConnecting(true);

    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    retryTimeoutRef.current = null;
    restartCountRef.current = 0;

    if (recognitionRef.current) {
      const prevRec = recognitionRef.current;
      recognitionRef.current = null;
      prevRec.onstart = null;
      prevRec.onresult = null;
      prevRec.onerror = null;
      prevRec.onend = null;
      try {
        if (typeof prevRec.abort === 'function') prevRec.abort();
        else prevRec.stop();
      } catch {}
    }

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
    } catch (error) {
      console.warn("Failed to resume speech recognition:", error);
      isIntentActiveRef.current = false;
      isPausedRef.current = false;
      setIsRecording(false);
      setIsPaused(false);
      setIsConnecting(false);
      setErrorMessage(getSpeechStartErrorMessage(error));
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
        recognition.onstart = null;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
      }
      try { recognition.abort?.(); } catch {}
    }
  }, [initRecognition]);

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
