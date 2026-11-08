export const dynamic = 'force-dynamic';
import { AddTopicButton } from "@/components/dashboard/add-topic-button";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { Navbar } from "@/components/dashboard/navbar";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarProvider,
  SidebarTrigger,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/ui/logo";
import dbConnect from "@/lib/mongoose";
import Topic from "@/models/Topic";
import { UserProfileButton } from "@/components/auth/user-profile-button";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import User from "@/models/User";
import { verifySessionCookie } from "@/lib/session";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const rawSession = cookies().get("user_session")?.value;
  const userId = verifySessionCookie(rawSession);
  if (!userId) {
    redirect("/?login=true");
  }

  let topicsDocs: any[] = [];
  let isDbWakingUp = false;
  let isAdmin = false;

  try {
    await dbConnect();
    topicsDocs = await Topic.find({ userId: userId }).sort({ createdAt: -1 }).lean();
    const user = await User.findOne({ uuid: userId }).lean();
    if (user && user.username === "mythicalhrg") {
      isAdmin = true;
    }
  } catch (error) {
    console.error("Dashboard layout dbConnect error:", error);
    isDbWakingUp = true;
  }

  if (isDbWakingUp) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground space-y-6">
        {/* Auto-refresh every 3 seconds until DB is awake */}
        <meta httpEquiv="refresh" content="3" />
        <Logo className="w-20 h-20 animate-pulse drop-shadow-xl" />
        <h1 className="text-3xl font-bold font-headline animate-pulse">Waking up the database...</h1>
        <p className="text-muted-foreground text-center max-w-md">
          Please hold on for a few seconds. The server is initializing your study space. This page will automatically refresh.
        </p>
        <div className="flex items-center gap-2 text-primary">
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
      </div>
    );
  }
  
  const topics = JSON.parse(JSON.stringify(topicsDocs)).map((doc: any) => ({
    ...doc,
    id: doc._id,
  }));

  return (
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader>
            <div className="flex items-center gap-2 data-[collapsed=true]:hidden pl-2 pt-2">
              <Logo className="size-8" />
              <h2 className="text-lg font-headline font-bold">Concepts Nichod</h2>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu>
              <SidebarNav topics={topics as any} isAdmin={isAdmin} />
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="p-4 border-t">
            <UserProfileButton />
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <div className="relative min-h-screen min-w-0 dashboard-gradient">
            <Navbar />
            <main className="min-w-0 p-4 sm:p-6 lg:p-8">
              {children}
            </main>
            <AddTopicButton />
          </div>
        </SidebarInset>
      </SidebarProvider>
  );
}
