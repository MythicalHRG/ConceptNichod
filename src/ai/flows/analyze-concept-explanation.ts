'use server';

/**
 * @fileOverview A flow to analyze a user's voice explanation of a concept and generate a mastery report.
 *
 * - analyzeConceptExplanation - A function that handles the concept analysis.
 * - AnalyzeConceptExplanationInput - The input type for the function.
 * - MasteryReportOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { googleAI } from '@genkit-ai/google-genai';
import { getGeminiApiKeyForTopic } from '@/lib/api-keys';

// --- Zod Schemas for Structured Output ---

const AnalyzeConceptExplanationInputSchema = z.object({
  topicId: z.string().describe("The database ID of the topic to ensure deterministic API key selection."),
  topic: z.string().describe('The name of the topic.'),
  explanation: z.string().describe('The transcribed text of the student\'s explanation.'),
  classLevel: z.string().describe('The student\'s class level.'),
});
export type AnalyzeConceptExplanationInput = z.infer<typeof AnalyzeConceptExplanationInputSchema>;

const RadarChartMetricSchema = z.object({
  metric: z.enum(['Conceptual Clarity', 'Examples Used', 'Confidence', 'Technical Terminology', 'Conciseness']),
  score: z.number().min(0).max(100).describe('The score for the metric, from 0 to 100.'),
});

const PieChartSegmentSchema = z.object({
  name: z.enum(['Fact', 'Fluff', 'Insight']),
  value: z.number().min(0).describe('The percentage value for this segment.'),
});

const MasteryReportOutputSchema = z.object({
  feedback_summary: z.string().describe('A constructive, encouraging critique of the student\'s explanation.'),
  radar_chart_data: z.array(RadarChartMetricSchema).length(5).describe('An array of 5 metrics for the radar chart.'),
  pie_chart_data: z.array(PieChartSegmentSchema).describe('An array of segments for the pie chart. The values should sum to 100.'),
});
export type MasteryReportOutput = z.infer<typeof MasteryReportOutputSchema>;

// --- Server Action / Flow ---

export async function analyzeConceptExplanation(
  input: AnalyzeConceptExplanationInput
): Promise<MasteryReportOutput> {
  return analyzeConceptExplanationFlow(input);
}

const prompt = ai.definePrompt({
  name: 'conceptAnalysisPrompt',
  input: { schema: AnalyzeConceptExplanationInputSchema },
  output: { schema: MasteryReportOutputSchema },
  model: googleAI.model('gemini-3.6-flash'), // Using specified free & fast model
  prompt: `You are a strict but encouraging professor analyzing a student's explanation of a concept.
  Your task is to provide a detailed mastery report based on their transcribed explanation.

  Concept Name: {{{topic}}}
  Student's Explanation: "{{{explanation}}}"
  Student Level: {{{classLevel}}}

  Analyze the student's explanation based on the following criteria:
  - **Conceptual Clarity**: How well did they explain the core idea? Is it accurate and easy to understand?
  - **Examples Used**: Did they use relevant examples to support their explanation?
  - **Confidence**: Based on the transcript, does the language sound confident or hesitant? Look for filler words ('um', 'uh', 'like'), long pauses (indicated by transcript gaps), or rephrasing as signs of low confidence.
  - **Technical Terminology**: Did they use specific, correct keywords related to the concept? Reward the use of appropriate jargon.
  - **Conciseness**: Was the explanation direct and to the point, or did it contain a lot of fluff and repetition?

  You MUST output ONLY a valid JSON object matching the provided schema. The scores in 'radar_chart_data' must be between 0 and 100. The values in 'pie_chart_data' must sum up to 100.
  `,
});

const analyzeConceptExplanationFlow = ai.defineFlow(
  {
    name: 'analyzeConceptExplanationFlow',
    inputSchema: AnalyzeConceptExplanationInputSchema,
    outputSchema: MasteryReportOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input, {
      config: { apiKey: getGeminiApiKeyForTopic(input.topicId) }
    });
    
    if (!output) {
      throw new Error("Failed to generate mastery report.");
    }

    // Ensure pie chart data sums to 100
    const pieTotal = output.pie_chart_data.reduce((sum, item) => sum + item.value, 0);
    if (pieTotal > 0 && pieTotal !== 100) {
      // Normalize the values to sum to 100 if they don't
      let runningTotal = 0;
      output.pie_chart_data.forEach((item, index) => {
        if (index < output.pie_chart_data.length - 1) {
          const normalizedValue = Math.round((item.value / pieTotal) * 100);
          item.value = normalizedValue;
          runningTotal += normalizedValue;
        } else {
          // Assign the remainder to the last item
          item.value = 100 - runningTotal;
        }
      });
    } else if (pieTotal === 0 && output.pie_chart_data.length > 0) {
        // Handle case where all values are 0
        output.pie_chart_data.forEach(item => item.value = 100 / output.pie_chart_data.length);
    }
    
    return output;
  }
);
