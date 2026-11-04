import { AdminPanel } from "@/components/admin/admin-panel";
import { cookies } from "next/headers";
import User from "@/models/User";
import dbConnect from "@/lib/mongoose";
import { redirect } from "next/navigation";
import { verifySessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await dbConnect();
  
  const rawSession = cookies().get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) {
    redirect("/?login=true");
  }

  const user = await User.findOne({ uuid: sessionUuid }).lean();
  if (!user || user.username !== "mythicalhrg") {
    redirect("/dashboard"); // Redirect normal users away from the admin page
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">Manage users and global platform bans.</p>
      </div>
      
      <AdminPanel />
    </div>
  );
}
