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
  practiceStatus?: 'not_started' | 'in_progress' | 'analyzing' | 'completed';
  analysisStartedAt?: Date;
  summaryViewed?: boolean;
  savedWrittenAnswers?: string[];
  savedSpokenAnswers?: string[];
  savedFinalSummarySpeech?: string;
  createdAt: Date;
};

export type Question = {
  type: string;
  question: string;
};
