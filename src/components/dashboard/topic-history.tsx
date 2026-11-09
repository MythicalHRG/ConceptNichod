'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookCopy, CheckCircle, Clock, ChevronRight, Sparkles, BookOpen } from 'lucide-react';
import type { Topic } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { LatexRenderer } from '@/components/ui/latex-renderer';

interface TopicHistoryProps {
  topics: Topic[];
}

function getSubjectBadgeColor(subject?: string) {
  const s = (subject || '').toLowerCase();
  if (s.includes('physic')) return 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20';
  if (s.includes('chem')) return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
  if (s.includes('math')) return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
  if (s.includes('bio')) return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
  if (s.includes('comp') || s.includes('ai') || s.includes('it')) return 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20';
  if (s.includes('eng')) return 'bg-sky-500/10 text-sky-500 border-sky-500/20';
  return 'bg-primary/10 text-primary border-primary/20';
}

function TopicItem({ topic }: { topic: Topic }) {
  const [formattedDate, setFormattedDate] = useState('Calculating...');

  useEffect(() => {
    if (topic.createdAt) {
      setFormattedDate(
        formatDistanceToNow(new Date(topic.createdAt), { addSuffix: true })
      );
    } else {
      setFormattedDate('Date unknown');
    }
  }, [topic.createdAt]);

  const score = topic.analysis?.overallScore;
  const isCompleted = !!topic.analysis;
  const isInProgress = !isCompleted && (topic.practiceStatus === 'in_progress' || topic.summaryViewed);

  return (
    <Link
      href={`/dashboard/topic/${topic.id}`}
      passHref
      className="block group"
      aria-label={`Open topic ${topic.name}`}
    >
      <div className="flex items-center justify-between p-3.5 sm:p-4 rounded-xl border border-border/70 bg-card hover:bg-muted/40 hover:border-primary/40 active:scale-[0.99] transition-all shadow-xs gap-3">
        {/* Left: Tactile Book Icon & Text */}
        <div className="flex items-center gap-3 sm:gap-4 text-left min-w-0 flex-1">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 group-hover:bg-primary group-hover:text-primary-foreground transition-all">
            <BookCopy className="w-5 h-5 shrink-0" />
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="font-semibold text-sm sm:text-base text-foreground group-hover:text-primary transition-colors leading-snug break-words">
              <LatexRenderer content={topic.name} />
            </div>

            <div className="flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground">
              {topic.subject && (
                <Badge variant="outline" className={`text-[10px] py-0 px-2 font-medium ${getSubjectBadgeColor(topic.subject)}`}>
                  {topic.subject}
                </Badge>
              )}
              {topic.chapter && (
                <span className="truncate max-w-[120px] sm:max-w-[200px] text-muted-foreground/80">
                  {topic.chapter}
                </span>
              )}
              <span className="text-muted-foreground/40 hidden sm:inline">•</span>
              <span className="text-muted-foreground/70 shrink-0 text-[11px]">{formattedDate}</span>
            </div>
          </div>
        </div>

        {/* Right: Status badge & Chevron */}
        <div className="flex items-center gap-2 shrink-0">
          {isCompleted ? (
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 gap-1 text-[11px] font-bold py-1 px-2">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>{score !== undefined ? `${score}%` : 'Mastered'}</span>
            </Badge>
          ) : isInProgress ? (
            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 gap-1 text-[11px] font-bold py-1 px-2">
              <Clock className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">In Progress</span>
            </Badge>
          ) : (
            <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary gap-1 text-[11px] font-medium py-1 px-2">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span className="hidden xs:inline">Ready</span>
            </Badge>
          )}

          <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    </Link>
  );
}

export function TopicHistory({ topics }: TopicHistoryProps) {
  return (
    <Card className="border border-border/80 shadow-xs overflow-hidden">
      <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-headline text-lg sm:text-xl flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              Your Concept Library
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm mt-0.5">
              Review, practice, and master your saved topics and chapters.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="font-mono text-xs font-bold px-2.5 py-0.5">
            {topics.length} {topics.length === 1 ? 'Topic' : 'Topics'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-2">
        {topics.length > 0 ? (
          <div className="space-y-2.5 sm:space-y-3 max-h-[70vh] overflow-y-auto touch-scrollbar pr-0.5">
            {topics.map((topic) => (
              <TopicItem key={topic.id} topic={topic} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center text-muted-foreground py-12 px-4 space-y-3 border border-dashed rounded-xl bg-muted/10">
            <BookCopy className="w-10 h-10 text-muted-foreground/40 animate-pulse" />
            <div className="space-y-1">
              <p className="font-semibold text-foreground text-sm sm:text-base">No concepts in your library yet</p>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-sm">
                Tap the gold <span className="font-bold text-primary">+</span> button to add your first chapter or topic and start learning.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
