import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import User from "@/models/User";
import dbConnect from "@/lib/mongoose";
import { getVerifiedSessionUuid } from "@/lib/session-auth";
import { ensurePlatformOwnerRole, isPlatformOwner } from "@/lib/owner-access";
import { DonationReconciliation } from "@/components/admin/donation-reconciliation";

export const dynamic = "force-dynamic";

export default async function AdminDonationsPage() {
  const sessionUuid = await getVerifiedSessionUuid();
  if (!sessionUuid) notFound();
  await dbConnect();
  const fetchedUser = await User.findOne({ uuid: sessionUuid }).select("uuid username email role").lean();
  const user = fetchedUser ? await ensurePlatformOwnerRole(fetchedUser) : fetchedUser;
  if (!isPlatformOwner(user)) notFound();

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
      <a href="/dashboard/admin" className="text-sm text-primary underline">← Admin dashboard</a>
      <DonationReconciliation />
    </main>
  );
}
