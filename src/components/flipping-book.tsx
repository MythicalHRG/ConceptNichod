"use client";

import { Logo } from '@/components/ui/logo';

export function FlippingBook() {
  return (
    <div
      aria-label="Concepts Nichod 3D Book Cover"
      className="relative w-[220px] h-[330px] sm:w-[260px] sm:h-[390px] md:w-[300px] md:h-[450px] rounded-xl select-none transition-transform duration-300 hover:scale-[1.02]"
    >
      {/* Book Cover */}
      <div className="relative w-full h-full rounded-xl shadow-2xl overflow-hidden border-2 border-primary/50 bg-gradient-to-br from-black via-zinc-900 to-amber-950/40 flex flex-col items-center justify-center p-6 sm:p-8">
        <div className="flex flex-col items-center gap-6 transform -translate-y-4">
          <Logo className="w-24 h-24 sm:w-28 sm:h-28 drop-shadow-2xl" />
          <div className="flex flex-col items-center">
            <h3 className="font-headline text-3xl sm:text-4xl text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 font-bold tracking-tight text-center drop-shadow-md">
              ConceptsNichod
            </h3>
            <p className="text-xs sm:text-sm text-amber-200/70 mt-3 font-medium tracking-wide uppercase text-center">
              Your journey begins here.
            </p>
          </div>
        </div>
        
        {/* Decorative elements */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-600 to-amber-400"></div>
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-12 h-1 rounded-full bg-amber-500/30"></div>
      </div>
    </div>
  );
}
