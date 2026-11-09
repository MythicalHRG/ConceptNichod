'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Volume2, Square, BookOpen, Clock, Type, Sparkles, FastForward } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { LatexRenderer } from '@/components/ui/latex-renderer';
import { FollowUpChat } from './follow-up-chat';

interface SummaryDisplayProps {
  summary: string;
  topic?: any;
}

export function SummaryDisplay({ summary, topic }: SummaryDisplayProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speechRate, setSpeechRate] = useState<number>(1);
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('base');
  const [readingProgress, setReadingProgress] = useState(0);
  const { toast } = useToast();

  // Calculate estimated reading time and word count
  const wordCount = useMemo(() => {
    return summary.trim().split(/\s+/).filter(Boolean).length;
  }, [summary]);

  const estimatedMinutes = Math.max(1, Math.round(wordCount / 160));

  // Clean up speech synthesis on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Track scroll progress for book reader progress bar
  useEffect(() => {
    const handleScroll = () => {
      const el = document.documentElement;
      const totalHeight = el.scrollHeight - el.clientHeight;
      if (totalHeight > 0) {
        const progress = Math.min(100, Math.max(0, (el.scrollTop / totalHeight) * 100));
        setReadingProgress(Math.round(progress));
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleTextToSpeech = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      toast({
        variant: "destructive",
        title: "Not Supported",
        description: "Your browser does not support text-to-speech audio.",
      });
      return;
    }

    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }

    // Strip markdown formatting and formulas for natural vocal delivery
    const textToRead = summary
      .replace(/#{1,4}\s/g, '')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/\$\$[^$]+\$\$/g, ' as defined in the mathematical formula ')
      .replace(/\$[^$]+\$/g, ' formula ');

    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.rate = speechRate;
    utterance.lang = 'en-US';

    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = (event) => {
      setIsPlaying(false);
      if (event.error !== 'interrupted' && event.error !== 'canceled') {
        toast({
          variant: "destructive",
          title: "Speech Notice",
          description: "Could not play the audio summary.",
        });
      }
    };

    setIsPlaying(true);
    window.speechSynthesis.speak(utterance);
  };

  const cycleRate = () => {
    const nextRate = speechRate === 1 ? 1.25 : speechRate === 1.25 ? 1.5 : 1;
    setSpeechRate(nextRate);
    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      toast({
        title: `Speech Speed: ${nextRate}x`,
        description: "Click Listen to resume at the new speed.",
      });
    }
  };

  const cycleFontSize = () => {
    const next = fontSize === 'sm' ? 'base' : fontSize === 'base' ? 'lg' : 'sm';
    setFontSize(next);
  };

  const fontSizeClasses = {
    sm: 'text-sm leading-relaxed',
    base: 'text-base leading-relaxed',
    lg: 'text-lg leading-loose',
  };

  return (
    <div className="space-y-6">
      {/* Dynamic Reading Progress Bar pinned to top on mobile & desktop */}
      <div
        className="fixed top-0 left-0 right-0 h-1 bg-primary/20 z-50 pointer-events-none"
        aria-hidden="true"
      >
        <div
          className="h-full bg-gradient-to-r from-amber-500 to-primary transition-all duration-150"
          style={{ width: `${readingProgress}%` }}
        />
      </div>

      {/* Reader Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 sm:p-4 rounded-xl border border-border/80 bg-card/60 backdrop-blur-md shadow-xs">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <Badge variant="outline" className="gap-1.5 text-xs py-1 px-2.5 border-primary/30 bg-primary/5 text-primary font-medium">
            <BookOpen className="w-3.5 h-3.5" />
            <span>Digital Nichod Reader</span>
          </Badge>

          <span className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <span>~{estimatedMinutes} min read</span>
            <span className="text-muted-foreground/40">•</span>
            <span>{wordCount} words</span>
          </span>
        </div>

        {/* Action Controls: Audio + Text Resizing */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <Button
            type="button"
            onClick={cycleFontSize}
            variant="ghost"
            size="sm"
            className="h-8 px-2.5 text-xs gap-1 text-muted-foreground hover:text-foreground"
            title="Adjust text size for easier reading"
          >
            <Type className="w-3.5 h-3.5" />
            <span className="uppercase font-bold">{fontSize}</span>
          </Button>

          <Button
            type="button"
            onClick={cycleRate}
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs font-mono text-muted-foreground hover:text-foreground"
            title="Toggle playback speed"
          >
            <FastForward className="w-3 h-3 mr-0.5" />
            <span>{speechRate}x</span>
          </Button>

          <Button
            type="button"
            onClick={handleTextToSpeech}
            size="sm"
            variant={isPlaying ? "destructive" : "outline"}
            className="h-8 px-3 text-xs gap-1.5 font-semibold transition-all"
          >
            {isPlaying ? (
              <>
                <Square className="w-3.5 h-3.5 animate-pulse" />
                <span>Stop</span>
              </>
            ) : (
              <>
                <Volume2 className="w-3.5 h-3.5 text-primary" />
                <span className="hidden xs:inline">Listen</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Main Concept Nichod Reader Card */}
      <Card className="border border-border/80 shadow-sm overflow-hidden bg-gradient-to-b from-card via-card to-background">
        <CardHeader className="p-4 sm:p-6 border-b border-border/60 bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="space-y-1">
              <span className="text-[11px] font-mono uppercase tracking-wider text-primary font-bold">
                Synthesized Learning Note
              </span>
              <CardTitle className="font-headline text-xl sm:text-2xl md:text-3xl text-foreground">
                {topic?.name || "Concept Summary"}
              </CardTitle>
            </div>

            <div className="flex items-center gap-1.5 self-start sm:self-auto text-xs text-muted-foreground bg-muted/60 px-3 py-1 rounded-full">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>AI-Structured Nichod</span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-7 md:p-9">
          {/* Typographic Book Content */}
          <article className={`prose dark:prose-invert max-w-none break-words ${fontSizeClasses[fontSize]}`}>
            <LatexRenderer content={summary} />
          </article>
        </CardContent>
      </Card>

      {/* Interactive Doubt-Clearing AI Assistant */}
      <FollowUpChat 
        topicName={topic?.name || "Concept"}
        topicSummary={summary}
        classLevel={topic?.classLevel || "General"}
        subject={topic?.subject || "General"}
      />
    </div>
  );
}
