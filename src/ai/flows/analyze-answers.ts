'use server';

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { getGeminiApiKeyForTopic } from '@/lib/api-keys';

const AnalyzeAnswersInputSchema = z.object({
  topicId: z.string().describe("The database ID of the topic to ensure deterministic API key selection."),
  topic: z.string().describe("The name of the topic."),
  summary: z.string().describe('The AI-generated summary to generate questions from.'),
  classLevel: z.string().describe("The student's class level (e.g., 'Class 10')."),
  writtenAnswers: z.array(z.object({
    question: z.string(),
    answer: z.string(),
  })).describe("The user's written answers to the first half of questions."),
  spokenAnswers: z.array(z.object({
    question: z.string(),
    answer: z.string(),
  })).describe("The user's spoken answers to the second half of questions."),
});

const FinalAnalysisSchema = z.object({
  overallScore: z.number().describe("The user's overall performance score out of 100 based on their written and spoken answers."),
  performanceSummary: z.string().describe("A concise, overall summary of the user's performance across written and spoken answers."),
  areasToFocus: z.array(z.string()).describe("A list of specific concepts or question types where the user struggled."),
  areasToImprove: z.array(z.string()).describe("Actionable advice on how to improve in the identified weak areas."),
  keyTermsForBonus: z.array(z.string()).describe("A list of important keywords or technical terms the user missed that could earn them extra points."),
  extraTips: z.array(z.string()).describe("Additional tips for improving answers, such as adding examples, diagrams, or structuring the answer better."),
  aiGeneratedAnswerIndices: z.array(z.number()).describe("An array of indices corresponding to the 'writtenAnswers' array that are suspected to be AI-generated."),
  chartsData: z.string().describe("The data to be used to generate charts for the report. This must be a raw JSON string of an array of chart objects, without any markdown formatting."),
});

export type FinalAnalysisOutput = z.infer<typeof FinalAnalysisSchema>;

const AnalyzeAnswersOutputSchema = z.object({
  analysis: FinalAnalysisSchema,
});

const prompt = ai.definePrompt({
  name: 'analyzeAnswersPrompt',
  input: {schema: AnalyzeAnswersInputSchema},
  output: {schema: AnalyzeAnswersOutputSchema},
  model: googleAI.model('gemini-3.6-flash'),
  prompt: `You are an AI expert evaluating a student directly in the Indian education system.
Perform a detailed analysis of the user's written answers and their spoken answers (including their 2-minute overall summary).
Address the user directly using "you" and "your". DO NOT use third-person terms like "the student" or "he/she". 
Evaluate your performance and assign an 'overallScore' out of 100. Deduct points for missing information, poor confidence in spoken answers, or if any written answers appear AI-generated (overly formal, generic).
Critically detect if any written answers appear AI-generated (overly formal, generic).
Evaluate the spoken answers specifically for Communication Skills (Clarity, Conciseness, Confidence) and Personality Traits (Openness, Conscientiousness, Extraversion).

Original Summary: {{{summary}}}

User's Written Answers:
{{#each writtenAnswers}}
  Q: {{this.question}}
  A: {{this.answer}}
{{/each}}

User's Spoken Answers:
{{#each spokenAnswers}}
  Q: {{this.question}}
  A: {{this.answer}}
{{/each}}

Respond with ONLY a JSON object containing an "analysis" object.
Your analysis must include: performanceSummary, areasToFocus, areasToImprove, keyTermsForBonus, extraTips, aiGeneratedAnswerIndices, and chartsData.

Also, create data for charts to visualize the user's skills. The charts data must be a raw JSON string of an array of objects. Each object should represent a chart and have 'type' ('bar', 'pie', or 'histo'), 'title', 'data', and 'config' properties.
  
IMPORTANT: The 'chartsData' field in your output must be a valid JSON string ONLY. Do not include any markdown formatting like \`\`\`json or any other text outside of the JSON array.
CRITICAL: Absolutely NO fields or properties anywhere in your JSON output can be null or undefined. If you cannot determine a score, default to 0. If a string array is empty, return an empty array [].

For bar charts, the 'data' should be an array of objects with 'name' and 'score' properties. The 'config' should define the 'score' with a label and a color.
For pie charts, the 'data' should be an array of objects with 'name', 'value', and 'fill' properties.

Example for chartsData:
[
  {
    "type": "bar",
    "title": "Topic Performance",
    "data": [
      { "name": "Comprehension", "score": 85 },
      { "name": "Expression", "score": 70 },
      { "name": "Critical Thinking", "score": 90 }
    ],
    "config": {
      "score": { "label": "Score", "color": "hsl(var(--chart-1))" }
    }
  },
  {
    "type": "bar",
    "title": "Communication Skills",
    "data": [
      { "name": "Clarity", "score": 85 },
      { "name": "Conciseness", "score": 70 },
      { "name": "Confidence", "score": 90 }
    ],
    "config": {
      "score": { "label": "Score", "color": "hsl(var(--chart-2))" }
    }
  },
  {
    "type": "pie",
    "title": "Personality Traits",
    "data": [
      { "name": "Openness", "value": 30, "fill": "hsl(var(--chart-1))" },
      { "name": "Conscientiousness", "value": 25, "fill": "hsl(var(--chart-2))" },
      { "name": "Extraversion", "value": 20, "fill": "hsl(var(--chart-3))" }
    ]
  },
  {
    "type": "histo",
    "title": "Confidence Over Time",
    "data": [
      { "name": "Start", "score": 40 },
      { "name": "Middle", "score": 60 },
      { "name": "End", "score": 85 }
    ],
    "config": {
      "score": { "label": "Confidence Level", "color": "hsl(var(--chart-4))" }
    }
  }
]
`,
});

export const analyzeAnswersFlow = ai.defineFlow(
  {
    name: 'analyzeAnswersFlow',
    inputSchema: AnalyzeAnswersInputSchema,
    outputSchema: AnalyzeAnswersOutputSchema,
  },
  async input => {
    const {output} = await prompt(input, {
      config: { apiKey: getGeminiApiKeyForTopic(input.topicId) }
    });
     if (!output) {
      throw new Error("The AI model failed to generate analysis. Please try again.");
    }
    return output;
  }
);
