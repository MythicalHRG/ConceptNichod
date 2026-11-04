import { useState, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import type { Question } from "@/lib/types";
import { LatexRenderer } from "@/components/ui/latex-renderer";

interface QuestionDisplayProps {
  question: Question;
  answer: string;
  onAnswerChange: (answer: string) => void;
}

export function QuestionDisplay({ question, answer, onAnswerChange }: QuestionDisplayProps) {
  const [localAnswer, setLocalAnswer] = useState(answer);

  useEffect(() => {
    setLocalAnswer(answer);
  }, [answer]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium text-primary">{question.type}</p>
        <div className="text-xl font-semibold leading-relaxed">
          <LatexRenderer content={question.question} />
        </div>
      </div>
      <Textarea
        placeholder="Type your answer here..."
        value={localAnswer}
        onChange={(e) => setLocalAnswer(e.target.value)}
        onBlur={() => onAnswerChange(localAnswer)}
        rows={6}
        className="text-base"
      />
    </div>
  );
}
