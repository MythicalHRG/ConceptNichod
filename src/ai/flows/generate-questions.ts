'use server';

import { callOpenRouter, parseJsonResponse } from '@/lib/openrouter';

export type GenerateQuestionsInput = {
  topicId: string;
  topic: string;
  summary: string;
  classLevel: string;
  subject: string;
  chapter: string;
  examFocus?: string;
};

export type GenerateQuestionsOutput = {
  questions: { type: string; question: string }[];
};

export async function generateQuestionsFlow(input: GenerateQuestionsInput): Promise<GenerateQuestionsOutput> {
  const { topic, summary, classLevel, subject, chapter, examFocus } = input;

  const prompt = `You are an AI expert for students in the Indian education system.
Generate exactly 6 diverse questions about "${topic}" from subject "${subject}", chapter "${chapter}" for a ${classLevel} student${examFocus ? ` preparing for ${examFocus}` : ''}, based on the summary below.

Summary:
${summary}

You MUST generate exactly one question of each type:
1. understanding
2. creativity  
3. reasoning
4. competency
5. analyzing
6. real-life application

Respond with ONLY a valid JSON object (no markdown):
{"questions":[{"type":"understanding","question":"..."},{"type":"creativity","question":"..."},{"type":"reasoning","question":"..."},{"type":"competency","question":"..."},{"type":"analyzing","question":"..."},{"type":"real-life application","question":"..."}]}`;

  const raw = await callOpenRouter([
    { role: 'user', content: prompt },
  ], undefined, true);

  const output = parseJsonResponse<GenerateQuestionsOutput>(raw);
  
  if (!output.questions || !Array.isArray(output.questions)) {
    throw new Error("The AI model failed to generate valid questions. Please try again.");
  }
  return output;
}
