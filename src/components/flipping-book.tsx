"use client";

import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Logo } from '@/components/ui/logo';

export function FlippingBook() {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Interactive Concepts Nichod 3D Book. Tap or hover to open."
      className="relative w-[220px] h-[330px] sm:w-[260px] sm:h-[390px] md:w-[300px] md:h-[450px] cursor-pointer transform-style-preserve-3d transition-transform duration-1000 focus:outline-none focus:ring-2 focus:ring-primary rounded-md select-none"
      onClick={() => setIsFlipped((prev) => !prev)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setIsFlipped((prev) => !prev);
        }
      }}
      onMouseEnter={() => setIsFlipped(true)}
      onMouseLeave={() => setIsFlipped(false)}
      style={{ transform: isFlipped ? 'translateX(30%) rotateY(-180deg)' : 'translateX(0) rotateY(0deg)' }}
    >
      {/* Book Cover */}
      <div className="absolute w-full h-full backface-hidden rounded-md shadow-2xl overflow-hidden border-2 border-primary/50 bg-gradient-to-br from-black via-zinc-900 to-amber-950/40 flex flex-col items-center justify-center p-6" style={{ transform: 'rotateY(0deg)' }}>
        <div className="flex flex-col items-center gap-6 transform -translate-y-4">
          <Logo className="w-28 h-28 drop-shadow-2xl" />
          <div className="flex flex-col items-center">
            <h3 className="font-headline text-4xl text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 font-bold tracking-tight text-center drop-shadow-md">
              ConceptsNichod
            </h3>
            <p className="text-sm text-amber-200/70 mt-3 font-medium tracking-wide uppercase">Your journey begins here.</p>
          </div>
        </div>
        
        {/* Decorative elements */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-600 to-amber-400"></div>
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-12 h-1 rounded-full bg-amber-500/30"></div>
      </div>
      
      {/* Book Back/Inside */}
      <div className="absolute w-full h-full bg-background rounded-md shadow-inner flex flex-col p-6 border-2 border-primary/50" style={{ transform: 'rotateY(180deg)' }}>
        <h4 className="font-headline text-primary text-xl font-bold">Inside The Book</h4>
        <div className="space-y-3 mt-4 text-sm text-foreground/80">
            <p className="w-full h-3 bg-muted-foreground/20 rounded-full"></p>
            <p className="w-5/6 h-3 bg-muted-foreground/20 rounded-full"></p>
            <p className="w-full h-3 bg-muted-foreground/20 rounded-full"></p>
            <p className="w-4/6 h-3 bg-muted-foreground/20 rounded-full"></p>
            <p className="w-full h-3 bg-muted-foreground/20 rounded-full"></p>
            <p className="w-5/6 h-3 bg-muted-foreground/20 rounded-full"></p>
        </div>
      </div>
    </div>
  );
}
