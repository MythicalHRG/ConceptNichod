"use client";

import { useEffect, useState } from "react";

export function AnimatedBackground() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div 
      className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none bg-background select-none"
      style={{
        contain: "strict",
        transform: "translate3d(0, 0, 0)",
      }}
    >
      {/* High-performance hardware-accelerated ambient glow (0 repaint overhead) */}
      <div 
        className="absolute inset-0 opacity-40 dark:opacity-25 transition-opacity duration-700"
        style={{
          background: `
            radial-gradient(circle at 10% 10%, hsl(var(--primary) / 0.18) 0%, transparent 40%),
            radial-gradient(circle at 90% 15%, hsl(var(--accent) / 0.15) 0%, transparent 45%),
            radial-gradient(circle at 50% 90%, hsl(var(--primary) / 0.12) 0%, transparent 50%)
          `
        }} 
      />
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] opacity-15" />
    </div>
  );
}
