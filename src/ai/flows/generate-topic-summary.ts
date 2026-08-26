
'use server';

/**
 * @fileOverview A flow to generate a textbook-like summary of a given topic, tailored to a student's class level.
 *
 * - generateTopicSummary - A function that generates the summary.
 * - GenerateTopicSummaryInput - The input type for the generateTopicSummary function.
 * - GenerateTopicSummaryOutput - The return type for the generateTopicSummary function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { getGeminiApiKeyForTopic } from '@/lib/api-keys';

const GenerateTopicSummaryInputSchema = z.object({
  topicId: z.string().describe('The database ID of the topic to ensure deterministic API key selection.'),
  topic: z.string().describe('The topic to generate a summary for.'),
  classLevel: z.string().describe("The student's class level (e.g., 'Class 10') based on the Indian education system."),
  subject: z.string().describe("The subject of the topic (e.g., 'English')."),
  chapter: z.string().describe("The chapter of the topic (e.g., 'Portrait of a lady')."),
  examFocus: z.string().optional().describe("The specific exam the student is targeting, if any (e.g., 'JEE', 'NEET')."),
});

export type GenerateTopicSummaryInput = z.infer<typeof GenerateTopicSummaryInputSchema>;

const GenerateTopicSummaryOutputSchema = z.object({
  summary: z.string().describe('The generated textbook-like summary of the topic.'),
});

export type GenerateTopicSummaryOutput = z.infer<typeof GenerateTopicSummaryOutputSchema>;

export async function generateTopicSummary(input: GenerateTopicSummaryInput): Promise<GenerateTopicSummaryOutput> {
  return generateTopicSummaryFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateTopicSummaryPrompt',
  input: {schema: GenerateTopicSummaryInputSchema},
  output: {schema: GenerateTopicSummaryOutputSchema},
  model: googleAI.model('gemini-3.6-flash'),
  prompt: `Generate a detailed, well-structured, textbook-style summary for the topic "{{{topic}}}" from the subject "{{{subject}}}" and chapter "{{{chapter}}}" suitable for a student in {{{classLevel}}}{{#if examFocus}} who is preparing for the {{{examFocus}}} exam{{/if}}. The summary should be comprehensive and easy to understand, keeping the exam requirements in mind. Use plain text with paragraphs.`,
});

const generateTopicSummaryFlow = ai.defineFlow(
  {
    name: 'generateTopicSummaryFlow',
    inputSchema: GenerateTopicSummaryInputSchema,
    outputSchema: GenerateTopicSummaryOutputSchema,
  },
  async input => {
    const {output} = await prompt(input, {
      config: { apiKey: getGeminiApiKeyForTopic(input.topicId) }
    });
    if (!output) {
      throw new Error("The AI model failed to generate a valid summary. Please try again.");
    }
    return output;
  }
);
