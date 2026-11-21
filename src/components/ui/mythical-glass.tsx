"use client";

import React from "react";
import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";

interface MythicalUserBadgeProps {
  username?: string;
  showAt?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  showTitle?: boolean;
}

/**
 * Clean, Theme-Compatible Glassmorphic Presentation for @mythicalhrg (Platform Owner)
 * Designed for perfect contrast and visual harmony across all 6 light and dark themes.
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
    md: "px-3 py-1 text-xs sm:text-sm gap-1.5",
    lg: "px-3.5 py-1.5 text-sm gap-2",
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
        "inline-flex items-center rounded-full font-semibold select-none transition-all duration-200",
        // Theme-harmonious glass styling
        "backdrop-blur-md bg-amber-500/10 text-amber-800 dark:text-amber-300",
        "border border-amber-500/30 dark:border-amber-400/30",
        "shadow-xs hover:bg-amber-500/15",
        sizeClasses,
        className
      )}
      title="Platform Owner"
    >
      <Crown className={cn(iconSizes, "fill-amber-500 text-amber-500 shrink-0")} />
      <span className="font-bold tracking-tight">
        {showAt ? "@mythicalhrg" : "mythicalhrg"}
      </span>
      {showTitle && (
        <span className="ml-1 text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-900 dark:text-amber-200 border border-amber-500/30">
          OWNER
        </span>
      )}
    </span>
  );
}

/**
 * Elegant, theme-compatible glassmorphism card for @mythicalhrg's profile
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
        "relative rounded-2xl p-6 sm:p-8 transition-all duration-300",
        // Clean, theme-adaptive glassmorphism
        "backdrop-blur-xl bg-card/75 border border-border/80 shadow-md shadow-black/5 dark:shadow-black/20",
        // Subtle top specular edge
        "before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-border/60 before:to-transparent",
        className
      )}
    >
      {children}
    </div>
  );
}
