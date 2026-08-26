"use client";

import Image from 'next/image';
import { placeholderImages } from '@/lib/placeholder-images';
import { cn } from '@/lib/utils';
import { useState } from 'react';

export function FlippingBook() {
  const [isFlipped, setIsFlipped] = useState(false);
  const bookCover = placeholderImages.find(img => img.id === 'book-cover');

  return (
    <div
      className="relative w-[250px] h-[375px] md:w-[300px] md:h-[450px] cursor-pointer transform-style-preserve-3d transition-transform duration-1000"
      onMouseEnter={() => setIsFlipped(true)}
      onMouseLeave={() => setIsFlipped(false)}
      style={{ transform: isFlipped ? 'translateX(50%) rotateY(-180deg)' : 'translateX(0) rotateY(0deg)'}}
    >
      {/* Book Cover */}
      <div className="absolute w-full h-full backface-hidden rounded-md shadow-2xl overflow-hidden border-2 border-primary/50" style={{ transform: 'rotateY(0deg)' }}>
        {bookCover && (
          <Image
            src={bookCover.imageUrl}
            alt={bookCover.description}
            fill
            sizes="(max-width: 768px) 250px, 300px"
            className="object-cover"
            data-ai-hint={bookCover.imageHint}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent p-6 flex flex-col justify-end">
            <h3 className="font-headline text-3xl text-white font-bold">Concepts Nichod</h3>
            <p className="text-sm text-white/80 mt-2">Your journey to knowledge begins.</p>
        </div>
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
