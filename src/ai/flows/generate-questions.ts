'use server';

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { getGeminiApiKeyForTopic } from '@/lib/api-keys';

const GenerateQuestionsInputSchema = z.object({
  topicId: z.string().describe("The database ID of the topic to ensure deterministic API key selection."),
  topic: z.string().describe("The name of the topic."),
  summary: z.string().describe('The AI-generated summary to generate questions from.'),
  classLevel: z.string().describe("The student's class level (e.g., 'Class 10')."),
  subject: z.string().describe("The subject of the topic (e.g., 'English')."),
  chapter: z.string().describe("The chapter of the topic (e.g., 'Portrait of a lady')."),
  examFocus: z.string().optional().describe("The specific exam the student is targeting, if any (e.g., 'JEE', 'NEET')."),
});

const QuestionSchema = z.object({
  type: z
    .enum([
      'understanding',
      'creativity',
      'reasoning',
      'competency',
      'analyzing',
      'real-life application',
    ])
    .describe('The type of question.'),
  question: z.string().describe('The question text.'),
});

const GenerateQuestionsOutputSchema = z.object({
  questions: z.array(QuestionSchema),
});

export type GenerateQuestionsOutput = z.infer<typeof GenerateQuestionsOutputSchema>;

const prompt = ai.definePrompt({
  name: 'generateQuestionsPrompt',
  input: {schema: GenerateQuestionsInputSchema},
  output: {schema: GenerateQuestionsOutputSchema},
  model: googleAI.model('gemini-3.6-flash'),
  prompt: `You are an AI expert for students in the Indian education system.
Generate 6 diverse questions about "{{{topic}}}" from the subject "{{{subject}}}" and chapter "{{{chapter}}}" for a {{{classLevel}}} student{{#if examFocus}} preparing for the {{{examFocus}}} exam{{/if}}, based on the summary below.
The question types must be: 'understanding', 'creativity', 'reasoning', 'competency', 'analyzing', 'real-life application'.

Summary: {{{summary}}}

Respond with ONLY a JSON object with a "questions" array.
`,
});

export const generateQuestionsFlow = ai.defineFlow(
  {
    name: 'generateQuestionsFlow',
    inputSchema: GenerateQuestionsInputSchema,
    outputSchema: GenerateQuestionsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input, {
      config: { apiKey: getGeminiApiKeyForTopic(input.topicId) }
    });
     if (!output) {
      throw new Error("The AI model failed to generate valid questions. Please try again.");
    }
    return output;
  }
);
