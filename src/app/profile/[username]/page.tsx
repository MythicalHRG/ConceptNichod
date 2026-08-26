import React from 'react';
import { getPublicProfileData } from '@/app/actions/profile';
import { notFound } from 'next/navigation';
import { UserAnalytics } from '@/components/profile/user-analytics';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MapPin, Target, GraduationCap, Instagram, Ghost, Crown } from 'lucide-react';

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

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background aesthetics */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-blue-500/10 rounded-full blur-[100px] pointer-events-none -z-10" />

      <main className="container mx-auto px-4 py-12 max-w-6xl">
        
        {/* Profile Header */}
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6 mb-12 animate-in fade-in slide-in-from-top-4 duration-500">
          <Avatar className="w-32 h-32 border-4 border-background shadow-xl ring-2 ring-primary/20 relative">
            <AvatarImage src={`https://api.dicebear.com/7.x/${isOwner ? 'micah' : 'notionists'}/svg?seed=${user.username}`} alt={user.username} />
            <AvatarFallback className="text-3xl bg-primary text-primary-foreground">{initials}</AvatarFallback>
            {isOwner && (
              <div className="absolute -top-3 -right-3 bg-yellow-500 text-black p-1.5 rounded-full shadow-lg ring-2 ring-background z-10" title="Concept Nichod Owner">
                <Crown className="w-5 h-5" />
              </div>
            )}
          </Avatar>
          
          <div className="flex-1 text-center md:text-left space-y-3">
            <div>
              <div className="flex items-center justify-center md:justify-start gap-2">
                <h1 className="text-4xl font-extrabold tracking-tight">{user.fullName}</h1>
                {isOwner && (
                  <Badge variant="default" className="bg-gradient-to-r from-yellow-400 to-amber-600 hover:from-yellow-500 hover:to-amber-700 text-black font-bold uppercase tracking-widest text-[10px] px-2 py-0.5 border-none shadow-sm">
                    Owner
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
                <a href={`https://instagram.com/${user.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer">
                  <Badge variant="outline" className="flex items-center gap-1 cursor-pointer hover:bg-pink-500/10 hover:text-pink-500 transition-colors">
                    <Instagram className="w-3 h-3" />
                    {user.instagram}
                  </Badge>
                </a>
              )}
              {user.snapchat && (
                <a href={`https://snapchat.com/add/${user.snapchat.replace('@', '')}`} target="_blank" rel="noopener noreferrer">
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
          </div>
        </div>

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
