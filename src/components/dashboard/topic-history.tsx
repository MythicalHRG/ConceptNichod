
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { BookCopy, CheckCircle, Clock } from 'lucide-react';
import type { Topic } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';

interface TopicHistoryProps {
  topics: Topic[];
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

  return (
    <div className="flex w-full items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors group">
      <Link href={`/dashboard/topic/${topic.id}`} passHref className="flex-1 flex items-center justify-between min-w-0">
        <div className="flex items-center gap-4 text-left min-w-0">
          <BookCopy className="w-6 h-6 text-primary shrink-0" />
          <div className='min-w-0'>
            <p className="font-semibold whitespace-normal">{topic.name}</p>
            <p className="text-sm text-muted-foreground">
              {topic.subject} &bull; {formattedDate}
            </p>
          </div>
        </div>
        {topic.analysis ? (
          <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mx-4" />
        ) : (
          <Clock className="w-5 h-5 text-yellow-500 shrink-0 mx-4" />
        )}
      </Link>
    </div>
  );
}


export function TopicHistory({ topics }: TopicHistoryProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-headline">Your Topics</CardTitle>
        <CardDescription>
          A history of all the concepts you've started learning.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[calc(100vh-22rem)] w-full">
          {topics.length > 0 ? (
            <div className="space-y-4">
              {topics.map((topic) => (
                <TopicItem key={topic.id} topic={topic} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center text-muted-foreground h-[300px]">
              <p>No topics yet.</p>
              <p className="text-sm">Click the '+' button to add your first concept!</p>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
