"use client";

import React from "react";
import { Sparkles, Crown } from "lucide-react";
import { cn } from "@/lib/utils";

interface MythicalUserBadgeProps {
  username?: string;
  showAt?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  showTitle?: boolean;
}

/**
 * Ultra-premium Liquid Glassmorphic Presentation for @mythicalhrg
 * Features:
 * - Real optical liquid glassmorphism (backdrop-filter blur + saturation)
 * - Multi-layer specular reflections (dual-edge light refraction)
 * - Dynamic iridescent chromatic gradient text
 * - Continuous liquid caustics shimmer wave
 * - Floating glowing crown with refraction aura
 */
export function MythicalUserBadge({
  username = "mythicalhrg",
  showAt = true,
  size = "sm",
  className,
  showTitle = false,
}: MythicalUserBadgeProps) {
  const isMythical = (username || "").toLowerCase() === "mythicalhrg";

  if (!isMythical) {
    return <span className={cn("font-medium", className)}>{showAt ? `@${username}` : username}</span>;
  }

  const sizeClasses = {
    xs: "px-2 py-0.5 text-[10px] gap-1",
    sm: "px-2.5 py-0.5 text-xs gap-1.5",
    md: "px-3.5 py-1 text-sm gap-2",
    lg: "px-4 py-1.5 text-base gap-2.5",
  }[size];

  const iconSizes = {
    xs: "w-2.5 h-2.5",
    sm: "w-3 h-3",
    md: "w-3.5 h-3.5",
    lg: "w-4 h-4",
  }[size];

  return (
    <span
      className={cn(
        "relative inline-flex items-center rounded-full font-black tracking-wide overflow-hidden select-none transition-all duration-300",
        // Liquid glass backdrop and surface
        "backdrop-blur-xl backdrop-saturate-200",
        "bg-gradient-to-r from-amber-500/20 via-pink-500/15 via-purple-500/20 to-cyan-500/20",
        "dark:from-amber-400/25 dark:via-rose-500/20 dark:via-purple-600/25 dark:to-cyan-400/25",
        // Dual-edge specular glass borders and caustic reflections
        "border border-white/50 dark:border-white/30",
        "shadow-[0_4px_24px_rgba(245,158,11,0.35),0_1px_8px_rgba(168,85,247,0.3),inset_0_1.5px_2px_rgba(255,255,255,0.7),inset_0_-1.5px_2px_rgba(0,0,0,0.25)]",
        "hover:shadow-[0_6px_30px_rgba(245,158,11,0.5),0_2px_12px_rgba(168,85,247,0.4),inset_0_2px_3px_rgba(255,255,255,0.85)]",
        "hover:scale-[1.03] active:scale-[0.98]",
        sizeClasses,
        className
      )}
      style={{
        textShadow: "0 0 12px rgba(245, 158, 11, 0.4)",
      }}
      title="Root Architect & Platform Founder"
    >
      {/* Liquid Caustic Shimmer Light Wave */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_2.8s_infinite] bg-gradient-to-r from-transparent via-white/40 dark:via-white/25 to-transparent"
      />

      {/* Ambient Pulsing Glow Underlay */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-1 rounded-full bg-gradient-to-r from-amber-400/30 via-pink-500/20 to-cyan-400/30 blur-sm -z-10 animate-pulse opacity-70"
      />

      {/* Floating Liquid Crown Icon */}
      <span className="relative flex items-center justify-center text-amber-300 dark:text-amber-200 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]">
        <Crown className={cn(iconSizes, "fill-amber-400/90 text-amber-200 animate-[bounce_3s_infinite]")} />
      </span>

      {/* Chromatic Liquid Glass Metallic Typography */}
      <span className="relative font-extrabold bg-gradient-to-r from-amber-300 via-rose-300 via-purple-200 to-cyan-200 bg-clip-text text-transparent drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
        {showAt ? "@mythicalhrg" : "mythicalhrg"}
      </span>

      {/* Micro Prismatic Sparkle */}
      <Sparkles
        className={cn(
          iconSizes,
          "text-cyan-300 dark:text-cyan-200 animate-spin fill-cyan-300/60 drop-shadow-[0_0_6px_rgba(34,211,238,0.8)]"
        )}
        style={{ animationDuration: "6s" }}
      />

      {showTitle && (
        <span className="ml-1 text-[9px] uppercase tracking-widest font-black px-1.5 py-0.2 rounded-full bg-black/30 dark:bg-white/10 text-amber-200 border border-amber-400/40">
          Founder
        </span>
      )}
    </span>
  );
}

/**
 * Hero-grade liquid glassmorphism container for @mythicalhrg's profile
 */
export function MythicalProfileHeroCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative rounded-3xl p-6 sm:p-10 overflow-hidden transition-all duration-500",
        // Multi-layered liquid glass
        "backdrop-blur-3xl backdrop-saturate-200",
        "bg-gradient-to-br from-white/15 via-white/5 to-white/10 dark:from-white/10 dark:via-black/30 dark:to-white/5",
        "border-2 border-white/40 dark:border-white/20",
        "shadow-[0_12px_48px_0_rgba(139,92,246,0.35),0_0_24px_rgba(245,158,11,0.25),inset_0_2px_4px_0_rgba(255,255,255,0.7),inset_0_-2px_4px_0_rgba(0,0,0,0.3)]",
        className
      )}
    >
      {/* Liquid Glass Dynamic Caustics and Ambient Glow Blobs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -left-24 w-80 h-80 rounded-full bg-gradient-to-tr from-amber-500/35 via-rose-500/30 to-purple-600/35 blur-3xl -z-10 animate-[pulse_6s_ease-in-out_infinite]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-gradient-to-bl from-cyan-500/35 via-indigo-600/30 to-amber-500/30 blur-3xl -z-10 animate-[pulse_8s_ease-in-out_infinite]"
      />

      {/* Ambient Moving Glass Specular Sheen */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_5s_infinite] bg-gradient-to-r from-transparent via-white/15 dark:via-white/10 to-transparent"
      />

      {children}
    </div>
  );
}
