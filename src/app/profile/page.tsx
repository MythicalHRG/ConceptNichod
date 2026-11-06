import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import dbConnect from "@/lib/mongoose";
import { verifySessionCookie } from "@/lib/session";
import User from "@/models/User";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function ProfileIndexPage() {
  const userId = verifySessionCookie(cookies().get("user_session")?.value);
  if (!userId) redirect("/?login=true");

  await dbConnect();
  const [viewer, profiles] = await Promise.all([
    User.findOne({ uuid: userId }).select("uuid username fullName classLevel examFocus city shareLocation createdAt").lean(),
    User.find({ uuid: { $ne: userId } })
    .select("uuid username fullName classLevel examFocus city shareLocation createdAt")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean(),
  ]);
  if (!viewer) redirect("/?login=true");
  const allProfiles = [viewer, ...profiles];

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl space-y-6 px-4 py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Student profiles</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Browse student profiles. Email, account identifiers, and individual topics remain private.
          </p>
        </div>
        <Button asChild variant="outline"><Link href="/dashboard/aspirants-connect">Open AspirantsConnect</Link></Button>
      </header>

      {allProfiles.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          No student profiles are available yet.
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {allProfiles.map((profile) => {
            const isOwnProfile = profile.uuid === userId;
            return (
              <Link key={profile.uuid} href={`/profile/${encodeURIComponent(profile.username)}`} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Card className="h-full transition-colors hover:border-primary/50">
                  <CardContent className="space-y-2 p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{profile.fullName || profile.username}</h2>
                      {isOwnProfile && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">You</span>}
                    </div>
                    <p className="text-sm text-muted-foreground">@{profile.username}</p>
                    <p className="text-sm text-muted-foreground">{[profile.classLevel, profile.examFocus, profile.shareLocation ? profile.city : undefined].filter(Boolean).join(" · ") || "Student"}</p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
