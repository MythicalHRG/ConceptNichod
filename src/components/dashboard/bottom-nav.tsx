"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/components/ui/sidebar";
import { Home, Trophy, BookMarked, BrainCircuit, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const pathname = usePathname();
  const { setOpenMobile, openMobile } = useSidebar();

  // If in an active anti-cheating test session, do not render bottom nav
  const isInsideTest = pathname.startsWith("/dashboard/topic/") && typeof document !== "undefined" && document.body.classList.contains("test-in-progress");
  if (isInsideTest) {
    return null;
  }

  const navItems = [
    { label: "Home", href: "/dashboard", icon: Home, isActive: pathname === "/dashboard" },
    { label: "Rankings", href: "/dashboard/leaderboard", icon: Trophy, isActive: pathname === "/dashboard/leaderboard" },
    { label: "Notebook", href: "/dashboard/mistakes", icon: BookMarked, isActive: pathname === "/dashboard/mistakes" },
    { label: "Mirror", href: "/dashboard/concept-mirror", icon: BrainCircuit, isActive: pathname === "/dashboard/concept-mirror" },
  ];

  const handleOpenDrawer = () => {
    if (typeof window !== "undefined" && window.navigator?.vibrate) {
      window.navigator.vibrate(15);
    }
    setOpenMobile(true);
  };

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="sm:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-border/80 bg-background/85 backdrop-blur-xl pb-[env(safe-area-inset-bottom,0px)] shadow-lg transition-all"
    >
      <div className="grid grid-cols-5 h-14 items-center px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 h-full rounded-lg transition-all select-none relative",
                item.isActive
                  ? "text-primary font-bold"
                  : "text-muted-foreground hover:text-foreground active:scale-95"
              )}
            >
              <div
                className={cn(
                  "p-1 rounded-full transition-all",
                  item.isActive && "bg-primary/15"
                )}
              >
                <Icon className={cn("w-4 h-4", item.isActive ? "stroke-[2.5]" : "stroke-[1.8]")} />
              </div>
              <span className="text-[10px] leading-tight tracking-tight">
                {item.label}
              </span>
              {item.isActive && (
                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}

        {/* Drawer button to open full sidebar / topics */}
        <button
          type="button"
          onClick={handleOpenDrawer}
          className={cn(
            "flex flex-col items-center justify-center gap-0.5 h-full rounded-lg transition-all select-none active:scale-95",
            openMobile ? "text-primary font-bold" : "text-muted-foreground hover:text-foreground"
          )}
          aria-label="Open topics and menu"
        >
          <div className={cn("p-1 rounded-full transition-all", openMobile && "bg-primary/15")}>
            <Menu className="w-4 h-4 stroke-[2]" />
          </div>
          <span className="text-[10px] leading-tight tracking-tight">
            Topics
          </span>
        </button>
      </div>
    </nav>
  );
}
