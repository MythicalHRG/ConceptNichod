"use client";

import { useState, useEffect, useMemo } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { Question } from "@/lib/types";
import { LatexRenderer } from "@/components/ui/latex-renderer";
import { PenLine, FileText } from "lucide-react";

interface QuestionDisplayProps {
  question: Question;
  answer: string;
  onAnswerChange: (answer: string) => void;
  disabled?: boolean;
}

export function QuestionDisplay({
  question,
  answer,
  onAnswerChange,
  disabled = false,
}: QuestionDisplayProps) {
  const [localAnswer, setLocalAnswer] = useState(answer);

  useEffect(() => {
    setLocalAnswer(answer);
  }, [answer]);

  const wordCount = useMemo(() => {
    return localAnswer.trim().split(/\s+/).filter(Boolean).length;
  }, [localAnswer]);

  return (
    <div className="space-y-4 sm:space-y-5 min-w-0">
      {/* Question Prompt Card */}
      <div className="p-4 sm:p-5 rounded-xl border border-primary/20 bg-primary/5 space-y-2 min-w-0 overflow-hidden">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Badge
            variant="outline"
            className="border-primary/30 bg-primary/10 text-primary font-bold text-[11px] gap-1 px-2.5 py-0.5"
          >
            <PenLine className="w-3 h-3" />
            <span>{question.type || "Conceptual Recall Question"}</span>
          </Badge>
          <span className="text-[11px] text-muted-foreground font-mono">
            Written Response
          </span>
        </div>

        <div className="text-base sm:text-lg md:text-xl font-semibold leading-relaxed break-words text-foreground pt-1 min-w-0 overflow-hidden">
          <LatexRenderer content={question.question} />
        </div>
      </div>

      {/* Answer Textarea with Live Metrics */}
      <div className="space-y-2">
        <Textarea
          placeholder="Explain your conceptual reasoning here in detail. Cite formulas, definitions, and logical steps..."
          value={localAnswer}
          maxLength={5000}
          disabled={disabled}
          onChange={(e) => {
            if (disabled) return;
            const val = e.target.value;
            setLocalAnswer(val);
            onAnswerChange(val);
          }}
          onBlur={() => {
            if (!disabled) onAnswerChange(localAnswer);
          }}
          rows={6}
          className={`text-base leading-relaxed p-3.5 sm:p-4 rounded-xl border-border/80 focus-visible:ring-primary/40 min-h-[140px] sm:min-h-[160px] resize-y ${
            disabled ? "opacity-60 cursor-not-allowed bg-muted" : "bg-card"
          }`}
        />

        <div className="flex items-center justify-between text-xs text-muted-foreground px-1 font-mono">
          <span className="flex items-center gap-1">
            <FileText className="w-3.5 h-3.5 text-muted-foreground" />
            <span>{wordCount} words</span>
            <span className="text-muted-foreground/40">•</span>
            <span>{localAnswer.length} chars</span>
          </span>
          {wordCount >= 20 ? (
            <span className="text-emerald-500 font-semibold">Good explanation depth</span>
          ) : (
            <span className="text-amber-500/80">Aim for a detailed explanation</span>
          )}
        </div>
      </div>
    </div>
  );
}
