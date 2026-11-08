import React from 'react';
import { getPublicProfileData } from '@/app/actions/profile';
import { notFound } from 'next/navigation';
import { UserAnalytics } from '@/components/profile/user-analytics';
import { UserBadgesShowcase } from '@/components/profile/user-badges-showcase';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MapPin, Target, GraduationCap, Instagram, Ghost, Crown, Sparkles } from 'lucide-react';
import { MythicalUserBadge, MythicalProfileHeroCard } from "@/components/ui/mythical-glass";

export const metadata = {
  title: 'User Profile - Concept Nichod',
  description: 'Public analytics and progress profile for a Concept Nichod user.',
};

export default async function PublicProfilePage({ params }: { params: { username: string } }) {
  const data = await getPublicProfileData(params.username);
  
  if (!data) {
    return notFound();
  }

  const { user } = data;
  const initials = user.fullName
    ? user.fullName.split(' ').map((n: string) => n[0]).join('').toUpperCase()
    : 'U';
    
  const isOwner = user.username.toLowerCase() === 'mythicalhrg';
  const isBadeMaalik = ['anurag', 'rohit'].includes(user.username.toLowerCase());

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background aesthetics */}
      {isOwner ? (
        <div className="absolute inset-0 pointer-events-none overflow-hidden -z-10">
          <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-amber-400/20 via-rose-500/15 to-purple-600/20 blur-[140px] animate-[pulse_7s_ease-in-out_infinite]" />
          <div className="absolute top-1/3 -right-40 w-[550px] h-[550px] rounded-full bg-gradient-to-bl from-cyan-400/20 via-indigo-500/15 to-purple-600/20 blur-[130px] animate-[pulse_9s_ease-in-out_infinite]" />
          <div className="absolute -bottom-40 left-1/3 w-[500px] h-[500px] rounded-full bg-gradient-to-t from-amber-500/15 via-pink-500/10 to-emerald-400/15 blur-[120px] animate-[pulse_11s_ease-in-out_infinite]" />
        </div>
      ) : (
        <>
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] pointer-events-none -z-10" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-blue-500/10 rounded-full blur-[100px] pointer-events-none -z-10" />
        </>
      )}

      <main className="container mx-auto px-3.5 sm:px-6 py-6 sm:py-12 max-w-6xl pb-safe">
        
        {/* Profile Header */}
        {isOwner ? (
          <MythicalProfileHeroCard className="mb-10 animate-in fade-in slide-in-from-top-6 duration-700">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-6 sm:gap-8">
              <div className="relative group shrink-0">
                {/* Iridescent Rotating Glass Glow Ring */}
                <div className="absolute -inset-2 rounded-full bg-gradient-to-tr from-amber-400 via-rose-500 via-purple-600 to-cyan-400 opacity-80 blur-md group-hover:opacity-100 transition-opacity animate-[spin_10s_linear_infinite]" />
                <Avatar className="w-28 h-28 sm:w-36 sm:h-36 border-4 border-white/60 dark:border-white/40 shadow-2xl relative ring-4 ring-amber-400/50">
                  <AvatarImage src={`https://api.dicebear.com/7.x/micah/svg?seed=${user.username}`} alt={user.username} />
                  <AvatarFallback className="text-4xl bg-gradient-to-br from-amber-400 to-purple-600 text-white font-black">{initials}</AvatarFallback>
                  <div className="absolute -top-3 -right-3 bg-gradient-to-r from-amber-400 via-pink-500 to-cyan-400 text-black p-2 rounded-full shadow-[0_0_20px_rgba(245,158,11,0.8)] ring-2 ring-white/80 animate-bounce" title="Root Architect & Founder">
                    <Crown className="w-5 h-5 fill-amber-200 text-slate-900" />
                  </div>
                </Avatar>
              </div>

              <div className="flex-1 text-center md:text-left space-y-4 min-w-0">
                <div>
                  <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
                    <h1 className="break-words text-3xl sm:text-5xl font-black tracking-tight bg-gradient-to-r from-amber-300 via-rose-300 via-purple-200 to-cyan-200 bg-clip-text text-transparent drop-shadow-[0_2px_12px_rgba(245,158,11,0.4)]">
                      {user.fullName}
                    </h1>
                    <MythicalUserBadge username={user.username} size="md" showAt={true} showTitle={true} />
                  </div>
                  <p className="text-amber-300/80 dark:text-amber-200/80 font-mono text-xs sm:text-sm tracking-wider uppercase font-semibold mt-1">
                    Platform Creator • Root Architect
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                  {user.classLevel && (
                    <Badge variant="secondary" className="backdrop-blur-md bg-white/10 dark:bg-white/5 border border-white/20 shadow-xs flex items-center gap-1 font-medium text-xs">
                      <GraduationCap className="w-3.5 h-3.5 text-amber-400" />
                      {user.classLevel}
                    </Badge>
                  )}
                  {user.city && (
                    <Badge variant="outline" className="backdrop-blur-md bg-white/10 dark:bg-white/5 border border-white/20 shadow-xs flex items-center gap-1 font-medium text-xs">
                      <MapPin className="w-3.5 h-3.5 text-rose-400" />
                      {user.city}
                    </Badge>
                  )}
                  {user.examFocus && (
                    <Badge className="backdrop-blur-md bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1 font-medium text-xs">
                      <Target className="w-3.5 h-3.5" />
                      {user.examFocus}
                    </Badge>
                  )}
                  {user.instagram && (
                    <a href={`https://instagram.com/${encodeURIComponent(user.instagram.replace(/^@/, ''))}`} target="_blank" rel="noopener noreferrer">
                      <Badge variant="outline" className="backdrop-blur-md bg-pink-500/10 text-pink-300 border-pink-400/30 flex items-center gap-1 cursor-pointer hover:bg-pink-500/20 transition-all text-xs">
                        <Instagram className="w-3.5 h-3.5" />
                        {user.instagram}
                      </Badge>
                    </a>
                  )}
                  {user.snapchat && (
                    <a href={`https://snapchat.com/add/${encodeURIComponent(user.snapchat.replace(/^@/, ''))}`} target="_blank" rel="noopener noreferrer">
                      <Badge variant="outline" className="backdrop-blur-md bg-yellow-500/10 text-yellow-300 border-yellow-400/30 flex items-center gap-1 cursor-pointer hover:bg-yellow-500/20 transition-all text-xs">
                        <Ghost className="w-3.5 h-3.5" />
                        {user.snapchat}
                      </Badge>
                    </a>
                  )}
                </div>

                {user.bio && (
                  <div className="backdrop-blur-md bg-white/10 dark:bg-black/25 border border-white/20 dark:border-white/10 rounded-2xl p-4 shadow-inner max-w-2xl">
                    <p className="text-foreground/90 italic font-medium text-sm sm:text-base">
                      "{user.bio}"
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
              <AvatarImage src={`https://api.dicebear.com/7.x/${isBadeMaalik ? 'adventurer' : 'notionists'}/svg?seed=${isBadeMaalik ? user.username + '-royal' : user.username}`} alt={user.username} />
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
                  <h1 className="break-words text-3xl font-extrabold tracking-tight sm:text-4xl">{user.fullName}</h1>
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
                  "{user.bio}"
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
          <p className="text-muted-foreground">Detailed breakdown of topics mastered by {user.fullName.split(' ')[0]}.</p>
        </div>
        
        <UserAnalytics data={data} />
        
      </main>
    </div>
  );
}
