"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "./button";

export function BackgroundMusic() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const synthRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    // 1. Initialize HTML5 Audio with locally hosted asset
    const audio = new Audio("/ambient.mp3");
    audio.loop = true;
    audio.volume = 0.35;
    audio.preload = "auto";

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onError = () => {
      console.warn("Background audio element error, fallback available");
    };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onError);

    audioRef.current = audio;

    // 2. Setup Web Audio fallback synthesizer in case HTML5 audio is blocked
    class WebAudioSynth {
      private ctx: AudioContext | null = null;
      private gainNode: GainNode | null = null;
      private oscillators: OscillatorNode[] = [];

      start() {
        if (this.ctx) return;
        try {
          const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext })
              .webkitAudioContext;
          if (!AudioCtx) return;
          this.ctx = new AudioCtx();
          this.gainNode = this.ctx.createGain();
          this.gainNode.gain.setValueAtTime(0.06, this.ctx.currentTime);
          this.gainNode.connect(this.ctx.destination);

          // Calming meditative drone chord frequencies (C, E, G, C)
          const freqs = [130.81, 164.81, 196.0, 261.63];
          this.oscillators = freqs.map((f, i) => {
            const osc = this.ctx!.createOscillator();
            osc.type = i % 2 === 0 ? "sine" : "triangle";
            osc.frequency.setValueAtTime(f, this.ctx!.currentTime);
            osc.connect(this.gainNode!);
            osc.start();
            return osc;
          });
        } catch (e) {
          console.warn("WebAudio synth fallback not supported:", e);
        }
      }

      stop() {
        this.oscillators.forEach((osc) => {
          try {
            osc.stop();
            osc.disconnect();
          } catch {
            // ignore
          }
        });
        this.oscillators = [];
        if (this.ctx) {
          try {
            this.ctx.close();
          } catch {
            // ignore
          }
          this.ctx = null;
        }
      }
    }

    synthRef.current = new WebAudioSynth();

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onError);
      audio.pause();
      if (synthRef.current) {
        synthRef.current.stop();
      }
    };
  }, []);

  const toggleMute = useCallback(async () => {
    const audio = audioRef.current;

    if (isPlaying) {
      if (audio) {
        audio.pause();
      }
      if (synthRef.current) {
        synthRef.current.stop();
      }
      setIsPlaying(false);
    } else {
      if (audio) {
        try {
          await audio.play();
          setIsPlaying(true);
          return;
        } catch (err) {
          console.warn(
            "HTML5 audio playback failed, falling back to WebAudio synth:",
            err
          );
        }
      }
      // Fallback
      if (synthRef.current) {
        try {
          synthRef.current.start();
          setIsPlaying(true);
        } catch (err) {
          console.error("Synthesizer fallback failed:", err);
          setIsPlaying(false);
        }
      }
    }
  }, [isPlaying]);

  return (
    <div className="fixed bottom-4 left-4 z-40">
      <Button
        variant="outline"
        size="icon"
        onClick={toggleMute}
        title={isPlaying ? "Mute ambient music" : "Play ambient music"}
        aria-label={isPlaying ? "Mute ambient music" : "Play ambient music"}
        className="rounded-full shadow-lg bg-background/80 backdrop-blur-md border-primary/30 hover:bg-primary/10 hover:scale-105 transition-all duration-300 group"
      >
        {isPlaying ? (
          <Volume2 className="w-5 h-5 text-primary animate-pulse" />
        ) : (
          <VolumeX className="w-5 h-5 text-muted-foreground group-hover:text-foreground" />
        )}
      </Button>
    </div>
  );
}
