import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import User from "@/models/User";
import dbConnect from "@/lib/mongoose";
import { verifySessionCookie } from "@/lib/session";
import { DonationReconciliation } from "@/components/admin/donation-reconciliation";

export const dynamic = "force-dynamic";

export default async function AdminDonationsPage() {
  const sessionUuid = verifySessionCookie(cookies().get("user_session")?.value);
  if (!sessionUuid) notFound();
  await dbConnect();
  const user = await User.findOne({ uuid: sessionUuid }).select("username").lean();
  if (!user || user.username !== "mythicalhrg") notFound();

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
      <a href="/dashboard/admin" className="text-sm text-primary underline">← Admin dashboard</a>
      <DonationReconciliation />
    </main>
  );
}
