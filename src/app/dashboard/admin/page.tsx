import { AdminPanel } from "@/components/admin/admin-panel";
import { cookies } from "next/headers";
import User from "@/models/User";
import dbConnect from "@/lib/mongoose";
import { notFound } from "next/navigation";
import { verifySessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const rawSession = cookies().get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) {
    notFound();
  }

  await dbConnect();

  const user = await User.findOne({ uuid: sessionUuid }).lean();
  if (!user || user.username !== "mythicalhrg") {
    notFound(); // Stealth 404: Never confirm to automated directory fuzzers that the admin dashboard exists
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">Manage users, platform settings, and donation reconciliation.</p>
        <a href="/dashboard/admin/donations" className="inline-flex mt-3 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">Review pending UPI donations</a>
      </div>
      
      <AdminPanel />
    </div>
  );
}
