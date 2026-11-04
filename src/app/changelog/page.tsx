export const dynamic = 'force-dynamic';

import React from "react";
import Link from "next/link";
import { getChangelogsAction } from "@/app/actions/changelog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Sparkles, Calendar, Tag, CheckCircle2 } from "lucide-react";

export const metadata = {
  title: "Changelog - ConceptNichod",
  description: "Explore the latest platform updates, features, and improvements in ConceptNichod.",
};

const CATEGORY_COLORS: Record<string, string> = {
  "Major Update": "bg-gradient-to-r from-purple-500 to-indigo-500 text-white border-none",
  Feature: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  Improvement: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  "Bug Fix": "bg-amber-500/10 text-amber-500 border-amber-500/20",
  Security: "bg-rose-500/10 text-rose-500 border-rose-500/20",
};

export default async function ChangelogPage() {
  const { changelogs = [] } = await getChangelogsAction();

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background aesthetics */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[35%] h-[35%] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none -z-10" />

      <main className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/dashboard">
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" /> Back to Dashboard
            </Button>
          </Link>
          <Badge variant="secondary" className="gap-1.5 px-3 py-1">
            <Sparkles className="w-3.5 h-3.5 text-primary" /> Live Updates
          </Badge>
        </div>

        <div className="text-center md:text-left mb-12 space-y-3">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight font-headline">
            Changelog & Updates
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Track all latest features, AI model upgrades, improvements, and fixes shipped to ConceptNichod.
          </p>
        </div>

        {/* Changelog Timeline */}
        {changelogs.length === 0 ? (
          <Card className="text-center p-12">
            <CardHeader>
              <CardTitle className="text-xl">No Updates Published Yet</CardTitle>
              <CardDescription>
                Check back soon! Platform updates and release notes will be posted here by the admin team.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="relative border-l-2 border-border/80 pl-6 md:pl-8 space-y-10 ml-3 md:ml-4">
            {changelogs.map((log: any, idx: number) => {
              const releaseDate = new Date(log.releaseDate).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              });
              const categoryClass = CATEGORY_COLORS[log.category] || "bg-primary/10 text-primary";

              return (
                <div key={log._id || idx} className="relative group">
                  {/* Timeline Dot */}
                  <div className="absolute -left-[31px] md:-left-[39px] top-1.5 w-4 h-4 rounded-full bg-background border-4 border-primary group-hover:scale-125 transition-transform" />

                  <Card className="shadow-sm hover:shadow-md transition-shadow border-border/70">
                    <CardHeader className="pb-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground">
                            {log.version}
                          </span>
                          <Badge className={categoryClass}>
                            {log.category}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{releaseDate}</span>
                        </div>
                      </div>
                      <CardTitle className="text-2xl font-bold font-headline">{log.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line prose dark:prose-invert max-w-none">
                        {log.content}
                      </div>

                      <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                        <span>Published by @{log.createdBy}</span>
                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Shipped
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
