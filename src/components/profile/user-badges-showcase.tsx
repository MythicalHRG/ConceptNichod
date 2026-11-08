"use client";

import React from "react";
import { UserBadge } from "@/lib/badges";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Crown,
  Trophy,
  Medal,
  Award,
  Flame,
  Zap,
  Sparkles,
  Target,
  BrainCircuit,
  Clock,
  Shield,
  Star,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ICON_MAP: Record<string, React.ElementType> = {
  Crown,
  Trophy,
  Medal,
  Award,
  Flame,
  Zap,
  Sparkles,
  Target,
  BrainCircuit,
};

export function UserBadgesShowcase({
  badges,
  topBadge,
}: {
  badges: UserBadge[];
  topBadge: UserBadge | null;
}) {
  if (!badges || badges.length === 0) {
    return (
      <Card className="border-dashed bg-card/40 p-4 text-center mt-6">
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>Complete concept summaries or Concept Mirror oral defenses to unlock Weekly & Velocity Badges.</span>
        </p>
      </Card>
    );
  }

  // The top/best badge
  const TopIcon = topBadge ? ICON_MAP[topBadge.icon] || Trophy : Trophy;

  return (
    <div className="space-y-4 mt-6">
      {/* 1. BEST / HIGHEST BADGE - PINNED PROMINENTLY AT TOP */}
      {topBadge && (
        <Card className={`relative overflow-hidden border shadow-md transition-all ${topBadge.colorScheme.badgeBorder} ${topBadge.colorScheme.badgeBg}`}>
          <div className="absolute -right-6 -bottom-6 opacity-10 pointer-events-none">
            <TopIcon className="w-36 h-36" />
          </div>

          <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className={`p-3 rounded-2xl bg-background/80 shadow-inner flex items-center justify-center ${topBadge.colorScheme.badgeText}`}>
                <TopIcon className="w-7 h-7 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-background/90 border text-foreground">
                    LEVEL {topBadge.level} • {topBadge.colorScheme.tierLabel}
                  </span>
                  <Badge variant="outline" className="text-[10px] bg-background/60 font-semibold">
                    {topBadge.periodLabel}
                  </Badge>
                </div>
                <h3 className="text-lg font-headline font-extrabold mt-1 text-foreground flex items-center gap-2">
                  {topBadge.name}
                  {topBadge.metricValue && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-primary/20 text-primary">
                      {topBadge.metricValue}
                    </span>
                  )}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
                  {topBadge.description}
                </p>
              </div>
            </div>

            <div className="shrink-0 text-right self-end sm:self-center">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-background/70 px-2.5 py-1 rounded-full border">
                <Clock className="w-3 h-3 text-primary" />
                <span>Live Server Status</span>
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 2. LEVEL-SORTED BADGES GRID (Descended by Level & Priority) */}
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Medal className="h-3.5 w-3.5 text-primary" />
            Rank Badges & Accolades ({badges.length})
          </h4>
          <span className="text-[11px] text-muted-foreground">
            Ranked &bull; Auto-renews on server time
          </span>
        </div>

        <TooltipProvider delayDuration={150}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {badges.map((badge) => {
              const IconComp = ICON_MAP[badge.icon] || Trophy;
              return (
                <Tooltip key={badge.id}>
                  <TooltipTrigger asChild>
                    <div
                      className={`group relative rounded-xl border p-3 flex items-start gap-3 transition-all duration-200 hover:shadow-md cursor-pointer ${
                        badge.id === topBadge?.id
                          ? "bg-primary/5 border-primary/40 ring-1 ring-primary/20"
                          : "bg-card/70 hover:bg-card/90 border-border"
                      }`}
                    >
                      <div
                        className={`p-2.5 rounded-xl shrink-0 transition-transform group-hover:scale-105 ${badge.colorScheme.badgeBg} ${badge.colorScheme.badgeText}`}
                      >
                        <IconComp className="w-5 h-5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <h5 className="text-xs font-bold truncate text-foreground">
                            {badge.name}
                          </h5>
                          <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-muted text-muted-foreground shrink-0">
                            L{badge.level}
                          </span>
                        </div>

                        <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                          {badge.description}
                        </p>

                        <div className="flex items-center gap-1.5 mt-1.5 text-[10px]">
                          {badge.metricValue && (
                            <span className="font-semibold text-primary">
                              {badge.metricValue}
                            </span>
                          )}
                          <span className="text-muted-foreground/60">&bull;</span>
                          <span className="text-muted-foreground">
                            {badge.periodLabel}
                          </span>
                        </div>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs space-y-1">
                    <p className="font-bold">{badge.name} (Level {badge.level})</p>
                    <p className="text-muted-foreground">{badge.description}</p>
                    <p className="text-[10px] text-primary/80 pt-1 border-t border-border/40">
                      Auto-evaluates against server rolling windows. Revokes automatically if qualifying standing drops.
                    </p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
      </div>
    </div>
  );
}
