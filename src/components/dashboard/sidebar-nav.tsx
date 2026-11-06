"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
  SidebarGroup,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { BookCopy, Home, BrainCircuit, Users, ShieldAlert, Sparkles, Heart, BookOpenCheck } from "lucide-react";

export function SidebarNav({ topics, isAdmin }: { topics: any[], isAdmin?: boolean }) {
  const pathname = usePathname();

  const mainNav = [
    { name: "Home", href: "/dashboard", icon: Home, isActive: pathname === "/dashboard" },
    { name: "Concept Mirror", href: "/dashboard/concept-mirror", icon: BrainCircuit, isActive: pathname === "/dashboard/concept-mirror" },
    { name: "Study Hub", href: "/dashboard/study", icon: BookOpenCheck, isActive: pathname === "/dashboard/study" },
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
            <Link href={item.href} className="w-full">
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
            <Link href={`/dashboard/topic/${topic.id}`} className="w-full">
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
