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

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await dbConnect();
  const userId = cookies().get("user_session")?.value;
  let topicsDocs: any[] = [];
  if (userId) {
    topicsDocs = await Topic.find({ userId: userId }).sort({ createdAt: -1 }).lean();
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
              <SidebarNav topics={topics as any} />
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="p-4 border-t">
            <UserProfileButton />
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <div className="relative min-h-screen dashboard-gradient">
            <Navbar />
            <main className="p-4 sm:p-6 lg:p-8">
              {children}
            </main>
            <AddTopicButton />
          </div>
        </SidebarInset>
      </SidebarProvider>
  );
}
