export const dynamic = 'force-dynamic';
import Link from "next/link";
import { TopicHistory } from '@/components/dashboard/topic-history';
import mongoose from "mongoose";
import dbConnect from "@/lib/mongoose";
import Topic from "@/models/Topic";
import User from "@/models/User";
import Blacklist from "@/models/Blacklist";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionCookie } from "@/lib/session";
import { ensurePlatformOwnerRole, isPlatformOwner } from "@/lib/owner-access";
import { normalizeEmail } from "@/lib/email-utils";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, GraduationCap, Target, Instagram, Cake } from "lucide-react";
import { Button } from "@/components/ui/button";

function formatDob(dobStr?: string | null) {
  if (!dobStr) return null;
  try {
    const d = new Date(dobStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    }
  } catch {}
  return dobStr;
}

export default async function DashboardPage() {
  const rawSession = (await cookies()).get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) {
    redirect("/?login=true");
  }

  let user: any = null;
  let isDbConnecting = false;
  let isBanned = false;

  try {
    await dbConnect();
    const userFields = "uuid username email role fullName bio classLevel dob city examFocus futureCollege snapchat instagram";
    user = await User.findOne({ uuid: sessionUuid }).select(userFields).lean();
    if (!user && mongoose.connection.readyState !== 1) {
      await dbConnect();
      user = await User.findOne({ uuid: sessionUuid }).select(userFields).lean();
    }
    if (user) user = await ensurePlatformOwnerRole(user);
    if (user && !isPlatformOwner(user)) {
      const emailVals = Array.from(
        new Set([String(user.email || "").toLowerCase(), normalizeEmail(String(user.email || ""))].filter(Boolean))
      );
      const banClauses: Array<{ type: "email" | "username"; value: string | { $in: string[] } }> = [];
      if (emailVals.length > 0) banClauses.push({ type: "email", value: { $in: emailVals } });
      if (user.username) banClauses.push({ type: "username", value: String(user.username).toLowerCase() });
      const banHit = banClauses.length > 0
        ? await Blacklist.findOne({ $or: banClauses }).select("_id").lean()
        : null;
      if (banHit) isBanned = true;
    }
  } catch (error) {
    console.error("Database connection error in dashboard:", error);
    isDbConnecting = true;
  }

  if (isDbConnecting) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        {/* Auto-refresh every 2 seconds if DB is waking up */}
        <meta httpEquiv="refresh" content="2" />
        <h1 className="text-3xl font-bold font-headline animate-pulse">Connecting to Workspace...</h1>
        <p className="text-muted-foreground text-center max-w-lg">
          Connecting to your cloud database cluster. Please wait a moment while your study materials load.
        </p>
        <a href="/dashboard">
          <Button className="mt-4">
            Refresh Page
          </Button>
        </a>
      </div>
    );
  }

  // Never mutate cookies() directly inside a Server Component (throws in Next.js App Router).
  if (!user || isBanned) {
    redirect("/?login=true");
  }

  // Fetch only the logged-in user's topics with projected fields (excludes bulky summary/questions/answers)
  const topicsDocs = await Topic.find({ userId: user.uuid })
    .select("_id name subject chapter practiceStatus summaryViewed analysis createdAt")
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  const topics = JSON.parse(JSON.stringify(topicsDocs)).map((doc: any) => ({
    ...doc,
    id: doc._id,
  }));

  const firstName = (user.fullName || user.username || "Learner").trim().split(/\s+/)[0] || "Learner";

  return (
    <div className="space-y-10 pb-10">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Zirconel</p>
      {/* User Profile Hero Card */}
      <Card className="bg-secondary/30 border-primary/20 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
        <CardContent className="p-4 sm:p-6 md:p-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="space-y-4 w-full md:w-auto min-w-0">
              <div>
                <h1 className="break-words text-2xl sm:text-3xl md:text-4xl font-headline font-bold text-foreground">
                  Welcome back, {firstName}!
                </h1>
                <p className="text-base sm:text-lg text-primary font-medium mt-1">@{user.username}</p>
              </div>

              {user.bio && (
                <p className="text-muted-foreground italic max-w-2xl text-sm sm:text-base break-words">
                  &ldquo;{user.bio}&rdquo;
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm mt-3">
                <div className="flex items-center gap-1.5 px-3 py-1 bg-background rounded-full border shadow-xs">
                  <GraduationCap className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="font-medium truncate max-w-[140px] sm:max-w-none">{user.classLevel}</span>
                </div>
                {user.dob && (
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-background rounded-full border shadow-xs">
                    <Cake className="w-3.5 h-3.5 text-pink-500 shrink-0" />
                    <span className="font-medium truncate max-w-[160px] sm:max-w-none">{formatDob(user.dob)}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 px-3 py-1 bg-background rounded-full border shadow-xs">
                  <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="font-medium truncate max-w-[140px] sm:max-w-none">{user.city}</span>
                </div>
                {(user.examFocus || user.futureCollege) && (
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-background rounded-full border shadow-xs">
                    <Target className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="font-medium break-words">
                      {user.examFocus && <span className="mr-1">{user.examFocus}</span>}
                      {user.examFocus && user.futureCollege && " • "}
                      {user.futureCollege && <span>{user.futureCollege}</span>}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-row md:flex-col gap-2 w-full md:w-auto md:min-w-[180px] shrink-0">
              {user.snapchat && (
                <a href={`https://snapchat.com/add/${encodeURIComponent(user.snapchat.replace(/^@/, ''))}`} target="_blank" rel="noopener noreferrer" className="flex-1 md:flex-initial">
                  <Button variant="outline" size="sm" className="w-full justify-center md:justify-start text-yellow-600 border-yellow-600/40 hover:bg-yellow-500/10 hover:text-yellow-700 bg-background/60 backdrop-blur-sm text-xs h-9">
                    <span className="font-bold">Snap:</span> <span className="ml-1.5 font-normal truncate max-w-[100px]">{user.snapchat}</span>
                  </Button>
                </a>
              )}
              {user.instagram && (
                <a href={`https://instagram.com/${encodeURIComponent(user.instagram.replace(/^@/, ''))}`} target="_blank" rel="noopener noreferrer" className="flex-1 md:flex-initial">
                  <Button variant="outline" size="sm" className="w-full justify-center md:justify-start text-pink-600 border-pink-600/40 hover:bg-pink-500/10 hover:text-pink-700 bg-background/60 backdrop-blur-sm text-xs h-9">
                    <Instagram className="h-3.5 w-3.5 mr-1 shrink-0" />
                    <span className="font-bold">Insta:</span> <span className="ml-1.5 font-normal truncate max-w-[100px]">{user.instagram}</span>
                  </Button>
                </a>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight mb-1">Your Topics</h2>
          <p className="text-muted-foreground">Manage and review your generated study materials.</p>
        </div>

        {topics.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 border border-dashed rounded-xl bg-secondary/10">
            <h3 className="text-xl font-semibold mb-2">No topics yet</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Head over to the <Link href="/dashboard/concept-mirror" className="text-primary hover:underline">Concept Mirror</Link> to generate your first AI study guide!
            </p>
          </div>
        ) : (
          <TopicHistory topics={topics as any} />
        )}
      </div>
    </div>
  );
}
