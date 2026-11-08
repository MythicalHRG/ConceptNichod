'use server';

import { cookies } from 'next/headers';
import { callOpenRouter } from '@/lib/openrouter';
import { verifySessionCookie } from '@/lib/session';
import { checkRateLimit } from '@/lib/rate-limiter';

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
  mode?: 'standard' | 'grill';
};

// Maximum number of past conversation messages sent to avoid context window explosion
const MAX_HISTORY_MESSAGES = 10;
const MAX_SUMMARY_CHARS = 4000;

export async function askFollowUpAction(input: FollowUpInput): Promise<{ answer: string }> {
  // Authentication check to prevent unauthenticated bot AI-scraping and token draining
  const rawSession = cookies().get('user_session')?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) {
    throw new Error('Please log in to ask follow-up questions.');
  }

  // Rate limiting: 15 requests per minute per user session
  const rateLimitKey = `followup:${sessionUuid}`;
  const rateCheck = checkRateLimit(rateLimitKey, 15, 60 * 1000);
  if (!rateCheck.success) {
    throw new Error('You are asking questions too fast. Please wait a moment before sending another message.');
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

  const isGrillMode = input.mode === 'grill';
  const systemMessage = isGrillMode
    ? `You are an elite Socratic Griller and examiner testing a ${safeClass} student's true first-principles grasp of "${safeTopic}" (${safeSubject}).

Topic Summary Reference:
---
${safeSummary}
---

Socratic Grilling Rules:
1. Relentlessly stress-test the student's conceptual depth, reasoning, and intuition.
2. If the student makes an assertion, challenge their assumptions: ask for boundary conditions, edge cases, mathematical derivations, or real-world counter-examples.
3. Ask one focused frontier challenge question per round to push them to derive insights themselves.
4. Always format mathematical formulas and derivations using LaTeX ($...$ for inline, $$...$$ for display blocks).
5. Maintain a sharp, intellectually rigorous, and encouraging academic tone.`
    : `You are a friendly, expert teacher helping a ${safeClass} student understand "${safeTopic}" from ${safeSubject}.

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
