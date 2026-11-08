'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Volume2, Square } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { LatexRenderer } from '@/components/ui/latex-renderer';
import { FollowUpChat } from './follow-up-chat';

export function SummaryDisplay({ summary, topic }: { summary: string; topic?: any }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  const handleTextToSpeech = () => {
    if (!('speechSynthesis' in window)) {
      toast({
        variant: "destructive",
        title: "Not Supported",
        description: "Your browser does not support text-to-speech.",
      });
      return;
    }

    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }

    // Strip markdown for speech synthesis
    const textToRead = summary
      .replace(/#{1,3}\s/g, '')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/\$\$[^$]+\$\$/g, '(mathematical formula)')
      .replace(/\$[^$]+\$/g, '(formula)');

    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = (event) => {
      setIsPlaying(false);
      if (event.error !== 'interrupted' && event.error !== 'canceled') {
        toast({
          variant: "destructive",
          title: "Speech Error",
          description: "Could not play the audio summary.",
        });
      }
    };

    setIsPlaying(true);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="font-headline text-xl sm:text-2xl">AI-Generated Summary</CardTitle>
          <Button onClick={handleTextToSpeech} size="sm" variant={isPlaying ? "destructive" : "outline"} className="self-start sm:self-auto shrink-0">
            {isPlaying ? <Square className="mr-2 h-4 w-4" /> : <Volume2 className="mr-2 h-4 w-4" />}
            {isPlaying ? "Stop Listening" : "Listen to Summary"}
          </Button>
        </CardHeader>
        <CardContent>
          <LatexRenderer content={summary} />
        </CardContent>
      </Card>

      {/* Interactive Doubt-Clearing AI Assistant */}
      <FollowUpChat 
        topicName={topic?.name || "Concept"}
        topicSummary={summary}
        classLevel={topic?.classLevel || "General"}
        subject={topic?.subject || "General"}
      />
    </div>
  );
}
