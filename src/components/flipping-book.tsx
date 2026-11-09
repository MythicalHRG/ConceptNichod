"use client";

import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Logo } from '@/components/ui/logo';
import { BookOpen, Sparkles, Brain, ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export function FlippingBook() {
  const [isFlipped, setIsFlipped] = useState(false);

  const handleToggle = () => {
    if (typeof window !== "undefined" && window.navigator?.vibrate) {
      window.navigator.vibrate(20);
    }
    setIsFlipped((prev) => !prev);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Interactive Concepts Nichod 3D Book. Tap or hover to open."
      className="relative w-[240px] h-[340px] sm:w-[280px] sm:h-[400px] md:w-[320px] md:h-[460px] cursor-pointer transform-style-preserve-3d transition-transform duration-700 focus:outline-none focus:ring-2 focus:ring-primary rounded-xl select-none"
      onClick={handleToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleToggle();
        }
      }}
      onMouseEnter={() => setIsFlipped(true)}
      onMouseLeave={() => setIsFlipped(false)}
      style={{
        transform: isFlipped ? 'translateX(10%) rotateY(-180deg)' : 'translateX(0) rotateY(0deg)',
      }}
    >
      {/* Book Cover */}
      <div
        className="absolute w-full h-full backface-hidden rounded-xl shadow-2xl overflow-hidden border-2 border-primary/50 bg-gradient-to-br from-black via-zinc-950 to-amber-950/50 flex flex-col items-center justify-between p-6 sm:p-7"
        style={{ transform: 'rotateY(0deg)' }}
      >
        <div className="w-full flex items-center justify-between text-amber-300/80 text-[10px] sm:text-xs font-mono tracking-widest uppercase">
          <span>AI Edition</span>
          <span>Vol. 2026</span>
        </div>

        <div className="flex flex-col items-center gap-4 text-center my-auto">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
            <Logo className="w-20 h-20 sm:w-24 sm:h-24 drop-shadow-2xl relative" />
          </div>
          <div className="flex flex-col items-center">
            <h3 className="font-headline text-3xl sm:text-4xl text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-300 to-amber-500 font-bold tracking-tight drop-shadow-md">
              ConceptsNichod
            </h3>
            <p className="text-xs sm:text-sm text-amber-200/80 mt-1.5 font-medium tracking-wide uppercase">
              Extract • Understand • Master
            </p>
          </div>
        </div>

        <div className="w-full flex items-center justify-center gap-1.5 text-[11px] text-amber-300/70 border-t border-amber-500/20 pt-3">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span>Tap or hover to look inside</span>
        </div>

        {/* Decorative spine & accents */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600" />
        <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-r from-black/40 to-transparent" />
      </div>

      {/* Book Back / Inside */}
      <div
        className="absolute w-full h-full bg-card rounded-xl shadow-2xl flex flex-col justify-between p-5 sm:p-6 border-2 border-primary/50 overflow-hidden text-card-foreground"
        style={{ transform: 'rotateY(180deg)', backfaceVisibility: 'hidden' }}
      >
        {/* Inside Header */}
        <div className="border-b border-border/80 pb-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-primary font-bold">
              Inside The Nichod
            </span>
            <BookOpen className="w-4 h-4 text-primary" />
          </div>
          <h4 className="font-headline text-foreground text-lg sm:text-xl font-bold mt-1">
            The Mastery Framework
          </h4>
        </div>

        {/* Real Content Excerpt */}
        <div className="space-y-2.5 my-auto text-xs sm:text-sm leading-snug">
          <div className="flex items-start gap-2 p-2 rounded-lg bg-primary/5 border border-primary/10">
            <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-foreground text-xs">1. Precision Nichod</p>
              <p className="text-[11px] text-muted-foreground">Laser-focused summary of core fundamentals and LaTeX formulas.</p>
            </div>
          </div>

          <div className="flex items-start gap-2 p-2 rounded-lg bg-primary/5 border border-primary/10">
            <Brain className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-foreground text-xs">2. Socratic Defense</p>
              <p className="text-[11px] text-muted-foreground">Defend the concept out loud in 2 minutes. No copy-pasting.</p>
            </div>
          </div>

          <div className="flex items-start gap-2 p-2 rounded-lg bg-primary/5 border border-primary/10">
            <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-foreground text-xs">3. Neural Feedback</p>
              <p className="text-[11px] text-muted-foreground">Multi-dimensional analysis, cognitive charts, and mistake notebook.</p>
            </div>
          </div>
        </div>

        {/* Footer Link */}
        <div className="pt-3 border-t border-border/80 flex items-center justify-between text-xs">
          <span className="text-muted-foreground text-[10px]">Turn pages anytime</span>
          <span className="text-primary font-bold flex items-center gap-1 text-[11px]">
            Explore Dashboard <ArrowRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </div>
  );
}
