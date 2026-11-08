"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
  SidebarGroup,
  SidebarGroupLabel,
  useSidebar,
} from "@/components/ui/sidebar";
import { BookCopy, Home, BrainCircuit, Users, ShieldAlert, Sparkles, Heart, Trophy, MessageSquare, BookMarked } from "lucide-react";

export function SidebarNav({ topics, isAdmin }: { topics: any[], isAdmin?: boolean }) {
  const pathname = usePathname();
  const { setOpenMobile, isMobile } = useSidebar();

  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const mainNav = [
    { name: "Home", href: "/dashboard", icon: Home, isActive: pathname === "/dashboard" },
    { name: "Leaderboard", href: "/dashboard/leaderboard", icon: Trophy, isActive: pathname === "/dashboard/leaderboard" },
    { name: "Mistake Notebook", href: "/dashboard/mistakes", icon: BookMarked, isActive: pathname === "/dashboard/mistakes" },
    { name: "Concept Mirror", href: "/dashboard/concept-mirror", icon: BrainCircuit, isActive: pathname === "/dashboard/concept-mirror" },
    { name: "Study Groups & Chat", href: "/dashboard/study-groups", icon: MessageSquare, isActive: pathname === "/dashboard/study-groups" },
    { name: "AspirantsConnect", href: "/dashboard/aspirants-connect", icon: Users, isActive: pathname === "/dashboard/aspirants-connect" },
    { name: "Support / Donate", href: "/donate", icon: Heart, isActive: pathname === "/donate" },
    { name: "Changelog", href: "/changelog", icon: Sparkles, isActive: pathname === "/changelog" },
  ];

  if (isAdmin) {
    mainNav.push({ name: "Admin Panel", href: "/dashboard/admin", icon: ShieldAlert, isActive: pathname === "/dashboard/admin" });
  }

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>Menu</SidebarGroupLabel>
        {mainNav.map((item) => (
          <SidebarMenuItem key={item.name}>
            <Link href={item.href} className="w-full" onClick={handleLinkClick}>
              <SidebarMenuButton
                isActive={item.isActive}
                tooltip={item.name}
              >
                <item.icon />
                <span>{item.name}</span>
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
        ))}
      </SidebarGroup>

      <SidebarSeparator />

      <SidebarGroup>
        <SidebarGroupLabel>Your Topics ({topics.length})</SidebarGroupLabel>
        {topics.map((topic) => (
          <SidebarMenuItem key={topic.id}>
            <Link href={`/dashboard/topic/${topic.id}`} className="w-full" onClick={handleLinkClick}>
              <SidebarMenuButton
                isActive={pathname === `/dashboard/topic/${topic.id}`}
                tooltip={topic.name}
              >
                <BookCopy />
                <span className="truncate">{topic.name}</span>
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
        ))}
      </SidebarGroup>
    </>
  );
}
