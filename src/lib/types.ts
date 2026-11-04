import type { GenerateQuestionsOutput } from "@/ai/flows/generate-questions";
import type { FinalAnalysisOutput } from "@/ai/flows/analyze-answers";

export type Topic = {
  id: string;
  userId: string;
  name: string;
  classLevel: string;
  subject: string;
  chapter: string;
  examFocus?: string;
  summary?: string;
  questions?: Question[];
  analysis?: FinalAnalysisOutput;
  practiceStatus?: 'in_progress' | 'completed';
  summaryViewed?: boolean;
  savedWrittenAnswers?: string[];
  savedSpokenAnswers?: string[];
  createdAt: Date;
};

export type Question = {
  type: string;
  question: string;
};
