'use server';

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

export async function askFollowUpAction(input: FollowUpInput): Promise<{ answer: string }> {
  const { topicName, topicSummary, classLevel, subject, conversationHistory } = input;

  const systemMessage = `You are a friendly, expert teacher helping a ${classLevel} student understand "${topicName}" from ${subject}.

You have access to the following summary of the topic:
---
${topicSummary}
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
    ...conversationHistory,
  ];

  const answer = await callOpenRouter(messages);
  return { answer };
}
