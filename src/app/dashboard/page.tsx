export const dynamic = 'force-dynamic';
import { TopicHistory } from '@/components/dashboard/topic-history';
import dbConnect from "@/lib/mongoose";
import Topic from "@/models/Topic";
import User from "@/models/User";
import { cookies } from "next/headers";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MapPin, GraduationCap, Target, Instagram } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  await dbConnect();
  
  const sessionUuid = cookies().get("user_session")?.value;
  let user = null;
  
  if (sessionUuid) {
    user = await User.findOne({ uuid: sessionUuid }).lean();
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <h1 className="text-3xl font-bold font-headline">Welcome to Concepts Nichod!</h1>
        <p className="text-muted-foreground text-center max-w-lg">
          Please sign in using the button in the bottom left corner to view your profile and manage your topics.
        </p>
      </div>
    );
  }

  // Fetch only the logged-in user's topics
  const topicsDocs = await Topic.find({ userId: user.uuid }).sort({ createdAt: -1 }).lean();
  
  const topics = topicsDocs.map(doc => ({
    ...doc,
    _id: doc._id.toString(),
    id: doc._id.toString(),
  }));

  return (
    <div className="space-y-10 pb-10">
      {/* User Profile Hero Card */}
      <Card className="bg-secondary/30 border-primary/20 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
        <CardContent className="p-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="space-y-4">
              <div>
                <h1 className="text-4xl font-headline font-bold text-foreground">
                  Welcome back, {user.fullName.split(' ')[0]}!
                </h1>
                <p className="text-lg text-primary font-medium mt-1">@{user.username}</p>
              </div>

              {user.bio && (
                <p className="text-muted-foreground italic max-w-2xl">
                  "{user.bio}"
                </p>
              )}

              <div className="flex flex-wrap items-center gap-4 text-sm mt-4">
                <div className="flex items-center gap-1.5 px-3 py-1 bg-background rounded-full border shadow-sm">
                  <GraduationCap className="w-4 h-4 text-primary" />
                  <span className="font-medium">{user.classLevel}</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-background rounded-full border shadow-sm">
                  <MapPin className="w-4 h-4 text-primary" />
                  <span className="font-medium">{user.city}</span>
                </div>
                {(user.examFocus || user.futureCollege) && (
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-background rounded-full border shadow-sm">
                    <Target className="w-4 h-4 text-primary" />
                    <span className="font-medium">
                      {user.examFocus && <span className="mr-1">{user.examFocus}</span>}
                      {user.examFocus && user.futureCollege && " • "}
                      {user.futureCollege && <span>{user.futureCollege}</span>}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3 min-w-[200px]">
              {user.snapchat && (
                <a href={`https://snapchat.com/add/${user.snapchat.replace('@', '')}`} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="w-full justify-start text-yellow-600 border-yellow-600 hover:bg-yellow-50 hover:text-yellow-700 bg-background/50 backdrop-blur-sm">
                    <span className="font-semibold">Snapchat:</span> <span className="ml-2 font-normal truncate">{user.snapchat}</span>
                  </Button>
                </a>
              )}
              {user.instagram && (
                <a href={`https://instagram.com/${user.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="w-full justify-start text-pink-600 border-pink-600 hover:bg-pink-50 hover:text-pink-700 bg-background/50 backdrop-blur-sm">
                    <Instagram className="h-4 w-4 mr-2" />
                    <span className="font-semibold">Insta:</span> <span className="ml-2 font-normal truncate">{user.instagram}</span>
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
              Head over to the <a href="/dashboard/concept-mirror" className="text-primary hover:underline">Concept Mirror</a> to generate your first AI study guide!
            </p>
          </div>
        ) : (
          <TopicHistory topics={topics as any} />
        )}
      </div>
    </div>
  );
}
