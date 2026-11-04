"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "./button";

export function BackgroundMusic() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Default sound is ON
  const [isPlaying, setIsPlaying] = useState(true);

  useEffect(() => {
    // Check if user previously explicitly muted
    const isMuted = typeof window !== "undefined" && localStorage.getItem("concept_music_muted") === "true";
    
    const audio = new Audio("https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3");
    audio.loop = true;
    audio.volume = 0.3; // Low volume, calm study ambiance
    audioRef.current = audio;

    if (isMuted) {
      setIsPlaying(false);
      return;
    }

    // Default: Sound ON with graceful autoplay-policy gesture listener fallback
    const attemptPlay = () => {
      if (!audioRef.current) return;
      audioRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch(() => {
          // Browser autoplay restriction: resume immediately upon first user gesture
          const playOnGesture = () => {
            if (audioRef.current && localStorage.getItem("concept_music_muted") !== "true") {
              audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
            }
          };
          window.addEventListener("click", playOnGesture, { once: true });
          window.addEventListener("keydown", playOnGesture, { once: true });
          window.addEventListener("touchstart", playOnGesture, { once: true });
        });
    };

    attemptPlay();

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const toggleMute = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        localStorage.setItem("concept_music_muted", "true");
        setIsPlaying(false);
      } else {
        audioRef.current
          .play()
          .then(() => {
            localStorage.removeItem("concept_music_muted");
            setIsPlaying(true);
          })
          .catch(() => {});
      }
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Button
        variant="outline"
        size="icon"
        onClick={toggleMute}
        aria-label={isPlaying ? "Mute background audio" : "Play background audio"}
        title={isPlaying ? "Mute Background Music" : "Play Background Music"}
        className="rounded-full shadow-lg bg-background/50 backdrop-blur-md border-primary/20 hover:bg-primary/10 hover:scale-110 transition-all duration-300 group"
      >
        {isPlaying ? (
          <Volume2 className="w-5 h-5 text-primary group-hover:animate-pulse" />
        ) : (
          <VolumeX className="w-5 h-5 text-muted-foreground" />
        )}
      </Button>
    </div>
  );
}
