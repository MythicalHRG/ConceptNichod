"use client";

import Link from "next/link";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Heart } from "lucide-react";
import { FeedbackDialog } from "./feedback-dialog";
import { NotificationBell } from "./notification-bell";

export function Navbar() {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/60 px-4 backdrop-blur-sm sm:px-6">
      <SidebarTrigger className="mr-2" />
      <div className="flex-1" />
      
      {/* Public Donation / Support Link */}
      <Link 
        href="/donate" 
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 transition-all shadow-xs"
        title="Support ConceptNichod"
      >
        <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
        <span className="hidden sm:inline">Support</span>
      </Link>

      <NotificationBell />
      <FeedbackDialog />
      <ThemeToggle />
    </header>
  );
}
