"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, Music } from "lucide-react";
import { Button } from "./button";

export function BackgroundMusic() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const audio = new Audio("https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3");
    audio.loop = true;
    audio.volume = 0.3; // Low volume, calm
    audioRef.current = audio;

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
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Button
        variant="outline"
        size="icon"
        onClick={toggleMute}
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
