"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "./button";

const STORAGE_KEY = "cn_music_btn_pos_v2";
const BUTTON_SIZE = 44;
const EDGE_MARGIN = 12;
const DRAG_THRESHOLD_PX = 6;

interface Position {
  x: number;
  y: number;
}

function clampPosition(x: number, y: number): Position {
  if (typeof window === "undefined") return { x, y };
  const maxX = Math.max(EDGE_MARGIN, window.innerWidth - BUTTON_SIZE - EDGE_MARGIN);
  const mobileBottomClearance = window.innerWidth < 768 ? 84 : 0;
  const maxY = Math.max(EDGE_MARGIN, window.innerHeight - BUTTON_SIZE - EDGE_MARGIN - mobileBottomClearance);
  return {
    x: Math.min(Math.max(EDGE_MARGIN, x), maxX),
    y: Math.min(Math.max(EDGE_MARGIN, y), maxY),
  };
}

export function BackgroundMusic() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const synthRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Draggable floating position (null = default bottom-left CSS anchor until moved or restored)
  const [position, setPosition] = useState<Position | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const suppressNextClickRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Restore saved button position & keep clamped on viewport resize
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
          setPosition(clampPosition(parsed.x, parsed.y));
        }
      }
    } catch {
      // Ignore storage errors
    }

    const handleResize = () => {
      setPosition((prev) => (prev ? clampPosition(prev.x, prev.y) : null));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    // 1. Initialize HTML5 Audio with preload="none" so the 4.7 MB file isn't downloaded until played
    const audio = new Audio("/ambient.mp3");
    audio.loop = true;
    audio.volume = 0.35;
    audio.preload = "none";

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
        if (this.ctx) {
          if (this.ctx.state === "suspended") {
            this.ctx.resume().catch(() => {});
          }
          return;
        }
        try {
          const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext })
              .webkitAudioContext;
          if (!AudioCtx) return;
          this.ctx = new AudioCtx();
          if (this.ctx.state === "suspended") {
            this.ctx.resume().catch(() => {});
          }
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
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }

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

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    dragStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: rect.left,
      originY: rect.top,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      drag.moved = true;
      setIsDragging(true);
    }

    if (drag.moved) {
      setPosition(clampPosition(drag.originX + dx, drag.originY + dy));
    }
  };

  const finishDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }

    if (drag.moved) {
      suppressNextClickRef.current = true;
      const finalPos = clampPosition(
        drag.originX + (e.clientX - drag.startX),
        drag.originY + (e.clientY - drag.startY)
      );
      setPosition(finalPos);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(finalPos));
      } catch {
        // ignore storage errors
      }
    }

    dragStateRef.current = null;
    setIsDragging(false);
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      style={
        position
          ? { left: `${position.x}px`, top: `${position.y}px` }
          : undefined
      }
      className={
        position
          ? "fixed z-40 touch-none select-none"
          : "fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] left-[calc(1rem+env(safe-area-inset-left,0px))] md:bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] md:left-auto md:right-[7.5rem] z-40 touch-none select-none"
      }
    >
      <Button
        variant="outline"
        size="icon"
        onClick={toggleMute}
        title={isPlaying ? "Mute ambient music (drag to move)" : "Play ambient music (drag to move)"}
        aria-label={isPlaying ? "Mute ambient music" : "Play ambient music"}
        className={`rounded-full shadow-lg bg-background/85 backdrop-blur-md border-primary/30 hover:bg-primary/10 transition-shadow duration-200 group ${
          isDragging ? "cursor-grabbing scale-110 ring-2 ring-primary/50 shadow-xl" : "cursor-grab hover:scale-105"
        }`}
      >
        {isPlaying ? (
          <Volume2 className="w-5 h-5 text-primary animate-pulse pointer-events-none" />
        ) : (
          <VolumeX className="w-5 h-5 text-muted-foreground group-hover:text-foreground pointer-events-none" />
        )}
      </Button>
    </div>
  );
}
