"use client";

import * as React from "react";
import { Moon, Sun, Check, Sparkles, Monitor } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const THEME_OPTIONS = [
  { id: "light", label: "Light", description: "Warm Daytime", color: "#f59e0b", icon: Sun },
  { id: "dark", label: "Dark", description: "Graphite Contrast", color: "#eab308", icon: Moon },
  { id: "midnight-neon", label: "Midnight Neon", description: "Electric Cyan", color: "#00e5ff", icon: Sparkles },
  { id: "sunset-amber", label: "Sunset Amber", description: "Twilight Glow", color: "#f97316", icon: Sparkles },
  { id: "forest-emerald", label: "Forest Emerald", description: "Botanical Pine", color: "#10b981", icon: Sparkles },
  { id: "cyberpunk-indigo", label: "Cyberpunk Indigo", description: "Synthwave Violet", color: "#a855f7", icon: Sparkles },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-label="Toggle theme">
        <Sun className="h-[1.2rem] w-[1.2rem]" />
      </Button>
    );
  }

  const activeTheme = THEME_OPTIONS.find((t) => t.id === theme);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Toggle theme" className="relative">
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          {activeTheme && (
            <span
              className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full border border-background shadow-xs ring-1 ring-black/20"
              style={{ backgroundColor: activeTheme.color }}
              title={`Current Theme: ${activeTheme.label}`}
            />
          )}
          <span className="sr-only">Select Theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 p-1.5">
        <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2 py-1.5">
          Color Themes (6)
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {THEME_OPTIONS.map((t) => {
          const isSelected = theme === t.id;
          return (
            <DropdownMenuItem
              key={t.id}
              onClick={() => setTheme(t.id)}
              className="flex items-center justify-between cursor-pointer py-1.5 px-2 rounded-md hover:bg-muted"
            >
              <div className="flex items-center gap-2.5">
                <span 
                  className="w-3.5 h-3.5 rounded-full border border-black/20 shrink-0 shadow-xs" 
                  style={{ backgroundColor: t.color }}
                />
                <div className="flex flex-col">
                  <span className="text-xs font-medium leading-none">{t.label}</span>
                  <span className="text-[10px] text-muted-foreground leading-tight mt-0.5">{t.description}</span>
                </div>
              </div>
              {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />
        
        <DropdownMenuItem
          onClick={() => setTheme("system")}
          className="flex items-center justify-between cursor-pointer py-1.5 px-2 rounded-md hover:bg-muted"
        >
          <div className="flex items-center gap-2.5">
            <Monitor className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">System Auto</span>
          </div>
          {theme === "system" && <Check className="w-3.5 h-3.5 text-primary" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
