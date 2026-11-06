"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-context";
import { AspirantsConnectHub } from "@/components/community/aspirants-connect-hub";

export default function AspirantsConnectPage() {
  const { isLoggedIn, isAuthReady, setAuthModalOpen } = useAuth();

  if (!isAuthReady) return <div className="flex min-h-[50vh] items-center justify-center gap-2 text-muted-foreground" role="status"><Loader2 className="size-5 animate-spin" /><span>Restoring your session…</span></div>;
  if (!isLoggedIn) return <div className="flex min-h-[50vh] flex-col items-center justify-center space-y-4"><h1 className="text-2xl font-bold">AspirantsConnect</h1><p className="text-muted-foreground">Sign in to connect with other students.</p><Button onClick={() => setAuthModalOpen(true)}>Sign in</Button></div>;

  return <AspirantsConnectHub />;
}
