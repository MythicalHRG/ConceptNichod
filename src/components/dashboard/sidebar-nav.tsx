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
import { BookCopy, Home, BrainCircuit, Users, ShieldAlert } from "lucide-react";

export function SidebarNav({ topics, isAdmin }: { topics: any[], isAdmin?: boolean }) {
  const pathname = usePathname();

  const mainNav = [
    { name: "Home", href: "/dashboard", icon: Home, isActive: pathname === "/dashboard" },
    { name: "Concept Mirror", href: "/dashboard/concept-mirror", icon: BrainCircuit, isActive: pathname === "/dashboard/concept-mirror" },
    { name: "AspirantsConnect", href: "/dashboard/aspirants-connect", icon: Users, isActive: pathname === "/dashboard/aspirants-connect" },
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
        <SidebarGroupLabel>Your Topics</SidebarGroupLabel>
        {topics.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground text-center data-[collapsed=true]:hidden">
            No topics yet. Add one to get started!
          </p>
        ) : (
          topics.map((topic) => (
            <SidebarMenuItem key={topic.id}>
              <Link href={`/dashboard/topic/${topic.id}`} className="w-full">
                <SidebarMenuButton
                  isActive={pathname === `/dashboard/topic/${topic.id}`}
                  tooltip={topic.name}
                >
                  <BookCopy />
                  <span>{topic.name}</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))
        )}
      </SidebarGroup>
    </>
  );
}
