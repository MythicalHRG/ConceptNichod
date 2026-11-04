'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, MessageSquare, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { LatexRenderer } from '@/components/ui/latex-renderer';
import { askFollowUpAction } from '@/app/actions/followup';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

type FollowUpChatProps = {
  topicName: string;
  topicSummary: string;
  classLevel: string;
  subject: string;
};

export function FollowUpChat({ topicName, topicSummary, classLevel, subject }: FollowUpChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 50);
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');

    const newMessages: Message[] = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);
    scrollToBottom();

    try {
      const res = await askFollowUpAction({
        topicName,
        topicSummary,
        classLevel,
        subject,
        conversationHistory: newMessages,
      });

      setMessages([...newMessages, { role: 'assistant', content: res.answer }]);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message || 'Could not get a response.' });
    } finally {
      setIsLoading(false);
      scrollToBottom();
    }
  };

  if (!isOpen) {
    return (
      <div className="flex justify-center mt-4">
        <Button
          onClick={() => setIsOpen(true)}
          variant="outline"
          className="gap-2 border-dashed"
        >
          <MessageSquare className="h-4 w-4 text-primary" />
          Have Questions? Ask AI
        </Button>
      </div>
    );
  }

  return (
    <Card className="mt-4 border-primary/20 shadow-md">
      <CardHeader className="pb-2 border-b border-border">
        <CardTitle className="text-base flex items-center gap-2 text-primary">
          <MessageSquare className="h-4 w-4" />
          Ask Follow-up Questions about "{topicName}"
        </CardTitle>
      </CardHeader>

      <CardContent className="p-0">
        <ScrollArea className="h-80 p-4" ref={scrollRef as any}>
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
              <MessageSquare className="h-8 w-8 opacity-30" />
              <p>Ask anything about this topic. The AI knows your summary!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'user' ? (
                    <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-4 py-2 text-sm">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-muted px-4 py-2 text-sm">
                      <LatexRenderer content={msg.content} />
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </CardContent>

      <CardFooter className="border-t border-border pt-3">
        <div className="flex w-full gap-2">
          <Input
            placeholder="e.g. Can you explain this with another example?"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            disabled={isLoading}
            className="flex-1"
          />
          <Button onClick={handleSend} disabled={isLoading || !input.trim()} size="icon">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
