'use server';

import { callOpenRouter } from '@/lib/openrouter';

export type GenerateTopicSummaryInput = {
  topicId: string;
  topic: string;
  classLevel: string;
  subject: string;
  chapter: string;
  examFocus?: string;
};

export type GenerateTopicSummaryOutput = {
  summary: string;
};

export async function generateTopicSummary(input: GenerateTopicSummaryInput): Promise<GenerateTopicSummaryOutput> {
  const { topic, classLevel, subject, chapter, examFocus } = input;

  const systemPrompt = `You are an expert Indian education teacher. 
Your summaries must be:
- Written in SIMPLE, easy-to-understand English
- Divided into clear SUBTOPICS with headers (use ## for each subtopic)
- Explained with REAL LIFE DAILY EXAMPLES (compare with everyday things students know)
- Comprehensive but clear for a ${classLevel} student
- For Math/Physics/Chemistry concepts: include LaTeX formatted equations using $...$ for inline math and $$...$$ for block equations. Never use raw symbols like $/ or \\frac without LaTeX wrapping.
- For exam preparation: highlight important points with **bold**

Format as clean markdown. Do NOT wrap the entire response in a code block.`;

  const userPrompt = `Generate a detailed, well-structured summary for the topic "${topic}" from subject "${subject}", chapter "${chapter}" for a ${classLevel} student${examFocus ? ` preparing for ${examFocus}` : ''}.

Requirements:
1. Start with a simple 1-2 line introduction (what this topic is about in simple words)
2. Divide into 3-5 subtopics using ## headers
3. For EACH subtopic: explain with a daily life example (e.g., "Think of it like...")
4. If the topic has formulas/equations: write them in LaTeX format (e.g., $$E = mc^2$$)
5. End with a "Key Points to Remember" section with bullet points`;

  const raw = await callOpenRouter([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);

  return { summary: raw };
}
