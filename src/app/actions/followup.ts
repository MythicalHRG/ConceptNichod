'use server';

import { cookies } from 'next/headers';
import { callOpenRouter } from '@/lib/openrouter';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

type FollowUpInput = {
  topicName: string;
  topicSummary: string;
  classLevel: string;
  subject: string;
  conversationHistory: Message[];
};

// Maximum number of past conversation messages sent to avoid context window explosion
const MAX_HISTORY_MESSAGES = 10;
const MAX_SUMMARY_CHARS = 4000;

export async function askFollowUpAction(input: FollowUpInput): Promise<{ answer: string }> {
  // Authentication check to prevent unauthenticated bot AI-scraping and token draining
  const sessionUuid = cookies().get('user_session')?.value;
  if (!sessionUuid) {
    throw new Error('Please log in to ask follow-up questions.');
  }

  const { topicName, topicSummary, classLevel, subject, conversationHistory = [] } = input;

  const safeTopic = (topicName || 'General Topic').slice(0, 150);
  const safeClass = (classLevel || 'Standard').slice(0, 50);
  const safeSubject = (subject || 'General Studies').slice(0, 50);
  const safeSummary = (topicSummary || '').slice(0, MAX_SUMMARY_CHARS);

  // Sliding window: keep only the latest N messages
  const recentHistory = conversationHistory.slice(-MAX_HISTORY_MESSAGES).map((m) => ({
    role: m.role,
    content: (m.content || '').slice(0, 1500),
  }));

  const systemMessage = `You are a friendly, expert teacher helping a ${safeClass} student understand "${safeTopic}" from ${safeSubject}.

You have access to the following summary of the topic:
---
${safeSummary}
---

Rules:
1. Answer in SIMPLE, easy-to-understand English like talking to a friend
2. Use daily life examples whenever possible
3. For math/physics: use LaTeX ($...$ for inline, $$...$$ for block equations)
4. Keep answers concise but complete — don't be too long
5. If you don't know something, say "I'm not sure about that one, let me help you with what I do know!"
6. NEVER say "as stated in the summary" — just answer naturally`;

  const messages = [
    { role: 'system' as const, content: systemMessage },
    ...recentHistory,
  ];

  const answer = await callOpenRouter(messages);
  return { answer };
}
