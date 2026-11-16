import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import User from "@/models/User";
import dbConnect from "@/lib/mongoose";
import { verifySessionCookie } from "@/lib/session";
import { isPlatformOwner } from "@/lib/owner-access";
import { DonationReconciliation } from "@/components/admin/donation-reconciliation";

export const dynamic = "force-dynamic";

export default async function AdminDonationsPage() {
  const sessionUuid = verifySessionCookie((await cookies()).get("user_session")?.value);
  if (!sessionUuid) notFound();
  await dbConnect();
  const user = await User.findOne({ uuid: sessionUuid }).select("username email role").lean();
  if (!isPlatformOwner(user)) notFound();

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
      <a href="/dashboard/admin" className="text-sm text-primary underline">← Admin dashboard</a>
      <DonationReconciliation />
    </main>
  );
}
