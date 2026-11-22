"use client";

import React, { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Sparkles, Send, Loader2, Bot, LogIn } from "lucide-react";
import { useAuth } from "@/components/auth/auth-context";
import { useToast } from "@/hooks/use-toast";
import { LatexRenderer } from "@/components/ui/latex-renderer";
import { askAboutProfileAction, type ProfileAiTurn } from "@/app/actions/profile-ai";

interface AskAboutProfileProps {
  username: string;
  displayName: string;
}

const STARTER_PROMPTS = [
  "Summarize strengths & weak areas",
  "How is the study progress & consistency?",
  "What should they focus on next?",
];

export function AskAboutProfile({ username, displayName }: AskAboutProfileProps) {
  const { user, isLoggedIn, setAuthModalOpen } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ProfileAiTurn[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const isOwnProfile = Boolean(
    user?.username && user.username.toLowerCase() === username.toLowerCase()
  );

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 60);
  }, []);

  const sendQuestion = async (rawQuestion: string) => {
    const clean = rawQuestion.trim();
    if (!clean || isLoading) return;

    const historySnapshot = messages.slice(-8);
    const nextMessages: ProfileAiTurn[] = [...messages, { role: "user", content: clean }];
    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);
    scrollToBottom();

    try {
      const res = await askAboutProfileAction({
        username,
        question: clean,
        history: historySnapshot,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: res.answer }]);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Profile AI Unavailable",
        description: err?.message || "Could not answer your question right now.",
      });
    } finally {
      setIsLoading(false);
      scrollToBottom();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          className="gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-primary text-primary-foreground font-semibold shadow-md hover:opacity-95 transition-all"
        >
          <Sparkles className="w-4 h-4" />
          <span>Ask About This Profile</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-lg max-h-[85dvh] rounded-2xl sm:rounded-2xl flex flex-col gap-3 p-4 sm:p-6 overflow-hidden">
        <DialogHeader className="text-left shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Bot className="w-5 h-5 text-primary shrink-0" />
            <span className="truncate">Ask AI About {isOwnProfile ? "Your Profile" : displayName}</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Analyze @{username}&apos;s public progress, Concept Mirror scores, subject strengths, and recommended next steps.
          </DialogDescription>
        </DialogHeader>

        {!isLoggedIn ? (
          <div className="py-8 px-4 text-center space-y-4 rounded-xl border border-dashed bg-muted/20">
            <Sparkles className="w-8 h-8 text-primary mx-auto opacity-80" />
            <div className="space-y-1">
              <p className="text-sm font-semibold">Sign in to use Profile AI</p>
              <p className="text-xs text-muted-foreground">
                Log in to ask interactive AI questions about @{username}&apos;s progress and study analytics.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              className="rounded-xl gap-2"
              onClick={() => {
                setOpen(false);
                setAuthModalOpen(true);
              }}
            >
              <LogIn className="w-4 h-4" />
              Sign In
            </Button>
          </div>
        ) : (
          <>
            {/* Quick Starter Chips */}
            <div className="flex flex-wrap gap-1.5 shrink-0">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={isLoading}
                  onClick={() => void sendQuestion(prompt)}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-primary/30 bg-primary/5 hover:bg-primary/15 text-foreground transition-colors disabled:opacity-50 text-left"
                >
                  {prompt}
                </button>
              ))}
            </div>

            {/* Chat Feed */}
            <div className="flex-1 min-h-[220px] max-h-[45dvh] overflow-y-auto touch-scrollbar rounded-xl border border-border/70 bg-muted/20 p-3 space-y-3">
              {messages.length === 0 ? (
                <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-center gap-2 text-muted-foreground text-xs px-4">
                  <Sparkles className="w-7 h-7 text-amber-500/70" />
                  <p>
                    Ask anything about <strong>@{username}</strong>&apos;s scores, weak areas, Concept Mirror oral fluency, or study plan!
                  </p>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={
                        msg.role === "user"
                          ? "max-w-[85%] min-w-0 overflow-hidden rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-3.5 py-2 text-xs sm:text-sm break-words"
                          : "max-w-[92%] min-w-0 overflow-hidden rounded-2xl rounded-tl-sm bg-background border border-border/70 px-3.5 py-2 text-xs sm:text-sm break-words"
                      }
                    >
                      <LatexRenderer content={msg.content} />
                    </div>
                  </div>
                ))
              )}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-tl-sm bg-background border border-border/70 px-3.5 py-2.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                    <span>Analyzing profile...</span>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendQuestion(input);
              }}
              className="flex items-center gap-2 shrink-0 pt-1"
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Ask about @${username}'s progress...`}
                maxLength={500}
                disabled={isLoading}
                className="flex-1 rounded-xl text-sm"
              />
              <Button
                type="submit"
                size="icon"
                disabled={isLoading || input.trim().length < 2}
                className="rounded-xl shrink-0"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
