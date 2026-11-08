"use client";

import React from "react";
import { UserBadge } from "@/lib/badges";
import {
  Crown,
  Trophy,
  Medal,
  Award,
  Flame,
  Zap,
  BrainCircuit,
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
  BrainCircuit,
};

const TIER_STYLES: Record<string, { chip: string; icon: string }> = {
  "badge-gold": {
    chip: "bg-amber-500/10 border-amber-500/40 text-amber-300 hover:bg-amber-500/15 shadow-sm shadow-amber-500/10",
    icon: "text-amber-400",
  },
  "badge-silver": {
    chip: "bg-slate-400/10 border-slate-400/40 text-slate-200 hover:bg-slate-400/15",
    icon: "text-slate-300",
  },
  "badge-bronze": {
    chip: "bg-orange-500/10 border-orange-500/30 text-orange-300 hover:bg-orange-500/15",
    icon: "text-orange-400",
  },
  "badge-flame": {
    chip: "bg-red-500/10 border-red-500/40 text-red-300 hover:bg-red-500/15 shadow-sm shadow-red-500/10",
    icon: "text-red-400",
  },
  "badge-emerald": {
    chip: "bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/15",
    icon: "text-emerald-400",
  },
  "badge-blue": {
    chip: "bg-blue-500/10 border-blue-500/40 text-blue-300 hover:bg-blue-500/15",
    icon: "text-blue-400",
  },
  "badge-purple": {
    chip: "bg-purple-500/10 border-purple-500/40 text-purple-300 hover:bg-purple-500/15",
    icon: "text-purple-400",
  },
  "badge-indigo": {
    chip: "bg-indigo-500/10 border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/15",
    icon: "text-indigo-400",
  },
  "badge-muted": {
    chip: "bg-muted/60 border-border text-muted-foreground hover:bg-muted/80",
    icon: "text-muted-foreground",
  },
};

export function UserBadgesShowcase({
  badges,
}: {
  badges: UserBadge[];
  topBadge?: UserBadge | null;
}) {
  if (!badges || badges.length === 0) return null;

  return (
    <div className="pt-2">
      <TooltipProvider delayDuration={100}>
        <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
          {badges.map((badge, idx) => {
            const Icon = ICON_MAP[badge.icon] || Trophy;
            const style = TIER_STYLES[badge.tierClass] || TIER_STYLES["badge-muted"];
            const isPrime = idx === 0;

            return (
              <Tooltip key={badge.id}>
                <TooltipTrigger asChild>
                  <div
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold cursor-pointer transition-all ${
                      style.chip
                    } ${isPrime ? "ring-1 ring-amber-500/30" : ""}`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${style.icon} ${isPrime ? "animate-pulse" : ""}`} />
                    <span>{badge.name}</span>
                    {badge.metricValue && (
                      <span className="text-[10px] opacity-75 font-mono px-1 rounded bg-black/20">
                        {badge.metricValue}
                      </span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs space-y-0.5 py-1.5 px-2.5">
                  <p className="font-bold text-foreground">{badge.name}</p>
                  <p className="text-muted-foreground text-[11px]">{badge.description}</p>
                  <p className="text-[10px] text-primary/80 pt-1 border-t border-border/50">
                    {badge.periodLabel} standing &bull; Auto-evaluated on server time
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    </div>
  );
}
