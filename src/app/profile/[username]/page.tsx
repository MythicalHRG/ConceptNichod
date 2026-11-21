import React from 'react';
import { getPublicProfileData } from '@/app/actions/profile';
import { notFound } from 'next/navigation';
import { UserAnalytics } from '@/components/profile/user-analytics';
import { UserBadgesShowcase } from '@/components/profile/user-badges-showcase';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MapPin, Target, GraduationCap, Instagram, Ghost, Crown } from 'lucide-react';
import { MythicalUserBadge, MythicalProfileHeroCard } from "@/components/ui/mythical-glass";

export const metadata = {
  title: 'User Profile - ConceptNichod',
  description: 'Public analytics and progress profile for a ConceptNichod user.',
};

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }> | { username: string };
}) {
  const { username: rawUsername } = await params;
  let decodedUsername = rawUsername;
  try {
    decodedUsername = decodeURIComponent(rawUsername);
  } catch {
    return notFound();
  }

  const data = await getPublicProfileData(decodedUsername);

  if (!data) {
    return notFound();
  }

  const { user } = data;
  const displayName = (user.fullName || user.username || 'User').trim();
  const firstName = displayName.split(/\s+/)[0] || 'User';
  const initials = displayName
    ? displayName.split(/\s+/).filter(Boolean).map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'U';

  const isOwner = user.username.toLowerCase() === 'mythicalhrg';
  const isBadeMaalik = ['anurag', 'rohit'].includes(user.username.toLowerCase());
  const encodedUsername = encodeURIComponent(user.username);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background aesthetics */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-blue-500/10 rounded-full blur-[100px] pointer-events-none -z-10" />

      <main className="container mx-auto px-3.5 sm:px-6 py-6 sm:py-12 max-w-6xl pb-safe">

        {/* Profile Header */}
        {isOwner ? (
          <MythicalProfileHeroCard className="mb-10 animate-in fade-in slide-in-from-top-6 duration-700">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-6 sm:gap-8">
              <div className="relative group shrink-0">
                <Avatar className="w-28 h-28 sm:w-36 sm:h-36 border-4 border-background shadow-xl relative ring-2 ring-amber-500/30">
                  <AvatarImage src={`https://api.dicebear.com/7.x/micah/svg?seed=${encodedUsername}`} alt={user.username} />
                  <AvatarFallback className="text-4xl bg-gradient-to-br from-amber-500 to-primary text-white font-black">{initials}</AvatarFallback>
                  <div className="absolute -top-2.5 -right-2.5 bg-amber-500 text-amber-950 p-2 rounded-full shadow-md ring-2 ring-background" title="Platform Owner">
                    <Crown className="w-4 h-4 fill-amber-100 text-amber-950" />
                  </div>
                </Avatar>
              </div>

              <div className="flex-1 text-center md:text-left space-y-4 min-w-0">
                <div>
                  <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
                    <h1 className="break-words text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
                      {displayName}
                    </h1>
                    <MythicalUserBadge username={user.username} size="md" showAt={true} showTitle={true} />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                  {user.classLevel && (
                    <Badge variant="secondary" className="flex items-center gap-1 font-medium text-xs">
                      <GraduationCap className="w-3.5 h-3.5 text-amber-500" />
                      {user.classLevel}
                    </Badge>
                  )}
                  {user.city && (
                    <Badge variant="outline" className="flex items-center gap-1 font-medium text-xs">
                      <MapPin className="w-3.5 h-3.5 text-rose-500" />
                      {user.city}
                    </Badge>
                  )}
                  {user.examFocus && (
                    <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 font-medium text-xs">
                      <Target className="w-3.5 h-3.5" />
                      {user.examFocus}
                    </Badge>
                  )}
                  {user.instagram && (
                    <a href={`https://instagram.com/${encodeURIComponent(user.instagram.replace(/^@/, ''))}`} target="_blank" rel="noopener noreferrer">
                      <Badge variant="outline" className="flex items-center gap-1 cursor-pointer hover:bg-pink-500/10 hover:text-pink-500 transition-colors text-xs">
                        <Instagram className="w-3.5 h-3.5" />
                        {user.instagram}
                      </Badge>
                    </a>
                  )}
                  {user.snapchat && (
                    <a href={`https://snapchat.com/add/${encodeURIComponent(user.snapchat.replace(/^@/, ''))}`} target="_blank" rel="noopener noreferrer">
                      <Badge variant="outline" className="flex items-center gap-1 cursor-pointer hover:bg-yellow-500/10 hover:text-yellow-600 dark:hover:text-yellow-400 transition-colors text-xs">
                        <Ghost className="w-3.5 h-3.5" />
                        {user.snapchat}
                      </Badge>
                    </a>
                  )}
                </div>

                {user.bio && (
                  <div className="rounded-xl border border-border/70 bg-muted/30 p-3.5 max-w-2xl">
                    <p className="text-foreground/90 italic font-medium text-sm sm:text-base">
                      &ldquo;{user.bio}&rdquo;
                    </p>
                  </div>
                )}

                <UserBadgesShowcase badges={data.badges} topBadge={data.topBadge} />
              </div>
            </div>
          </MythicalProfileHeroCard>
        ) : (
          <div className="flex flex-col md:flex-row items-center md:items-start gap-4 sm:gap-6 mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
            <Avatar className={`w-24 h-24 sm:w-32 sm:h-32 border-4 border-background shadow-xl relative ${isBadeMaalik ? 'ring-4 ring-purple-500 shadow-purple-500/40' : 'ring-2 ring-primary/20'}`}>
              <AvatarImage src={`https://api.dicebear.com/7.x/${isBadeMaalik ? 'adventurer' : 'notionists'}/svg?seed=${isBadeMaalik ? `${encodedUsername}-royal` : encodedUsername}`} alt={user.username} />
              <AvatarFallback className="text-3xl bg-primary text-primary-foreground">{initials}</AvatarFallback>
              {isBadeMaalik && (
                <div className="absolute -top-3 -right-3 bg-gradient-to-r from-purple-600 via-pink-500 to-amber-400 text-white p-1.5 rounded-full shadow-lg ring-2 ring-background z-10" title="Bade Maalik">
                  <Crown className="w-5 h-5 fill-amber-300 text-amber-300" />
                </div>
              )}
            </Avatar>

            <div className="flex-1 text-center md:text-left space-y-3">
              <div>
                <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
                  <h1 className="break-words text-3xl font-extrabold tracking-tight sm:text-4xl">{displayName}</h1>
                  {isBadeMaalik && (
                    <Badge className="bg-gradient-to-r from-purple-600 via-pink-500 to-amber-400 text-white font-extrabold uppercase tracking-widest text-[11px] px-3 py-1 border-none shadow-md">
                      👑 Bade Maalik
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground text-lg font-medium">@{user.username}</p>
              </div>

              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                {user.classLevel && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <GraduationCap className="w-3 h-3" />
                    {user.classLevel}
                  </Badge>
                )}
                {user.city && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {user.city}
                  </Badge>
                )}
                {user.examFocus && (
                  <Badge className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600">
                    <Target className="w-3 h-3" />
                    {user.examFocus}
                  </Badge>
                )}
                {user.instagram && (
                  <a href={`https://instagram.com/${encodeURIComponent(user.instagram.replace(/^@/, ''))}`} target="_blank" rel="noopener noreferrer">
                    <Badge variant="outline" className="flex items-center gap-1 cursor-pointer hover:bg-pink-500/10 hover:text-pink-500 transition-colors">
                      <Instagram className="w-3 h-3" />
                      {user.instagram}
                    </Badge>
                  </a>
                )}
                {user.snapchat && (
                  <a href={`https://snapchat.com/add/${encodeURIComponent(user.snapchat.replace(/^@/, ''))}`} target="_blank" rel="noopener noreferrer">
                    <Badge variant="outline" className="flex items-center gap-1 cursor-pointer hover:bg-yellow-500/10 hover:text-yellow-500 transition-colors">
                      <Ghost className="w-3 h-3" />
                      {user.snapchat}
                    </Badge>
                  </a>
                )}
              </div>

              {user.bio && (
                <p className="text-foreground/80 max-w-2xl mt-4 italic">
                  &ldquo;{user.bio}&rdquo;
                </p>
              )}

              {/* Dynamic & Hierarchical Badges Showcase */}
              <UserBadgesShowcase badges={data.badges} topBadge={data.topBadge} />
            </div>
          </div>
        )}

        {/* Separator */}
        <div className="w-full h-px bg-border my-8" />

        {/* Analytics Section */}
        <div className="space-y-4 mb-6">
          <h2 className="text-2xl font-bold tracking-tight">Progress & Analytics</h2>
          <p className="text-muted-foreground">Detailed breakdown of topics mastered by {firstName}.</p>
        </div>

        <UserAnalytics data={data} />

      </main>
    </div>
  );
}
