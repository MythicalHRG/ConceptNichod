import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Volume2, Square } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function SummaryDisplay({ summary }: { summary: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  // Simple formatting to remove markdown and add paragraphs
  const formattedSummary = summary
    .replace(/###\s/g, '') // Remove ### headers
    .replace(/\*\*/g, '')   // Remove bold markers
    .replace(/[*]/g, '')    // Remove single asterisks
    .split('\n')
    .filter(p => p.trim() !== '')
    .map((paragraph, index) => <p key={index} className="mb-4">{paragraph}</p>);

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

    // Clean up summary for reading (remove markdown)
    const textToRead = summary.replace(/#/g, '').replace(/\*/g, '');
    const utterance = new SpeechSynthesisUtterance(textToRead);
    
    utterance.onend = () => {
      setIsPlaying(false);
    };

    utterance.onerror = (event) => {
      setIsPlaying(false);
      // Browsers often throw 'interrupted' or 'canceled' when stopping or changing text, which is normal.
      if (event.error !== 'interrupted' && event.error !== 'canceled') {
          toast({
            variant: "destructive",
            title: "Speech Error",
            description: "Could not play the audio summary properly.",
          });
      }
    };

    setIsPlaying(true);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-headline">AI-Generated Summary</CardTitle>
        <Button onClick={handleTextToSpeech} size="sm" variant={isPlaying ? "destructive" : "outline"}>
          {isPlaying ? <Square className="mr-2" /> : <Volume2 className="mr-2" />}
          {isPlaying ? "Stop Listening" : "Listen to Summary"}
        </Button>
      </CardHeader>
      <CardContent className="prose prose-lg max-w-none text-foreground">
        <div className="text-base leading-relaxed">
           {formattedSummary}
        </div>
      </CardContent>
    </Card>
  );
}