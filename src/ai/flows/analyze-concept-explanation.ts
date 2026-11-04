'use server';

import { callOpenRouter, parseJsonResponse } from '@/lib/openrouter';

export type MasteryReportOutput = {
  feedback_summary: string;
  radar_chart_data: { metric: string; score: number }[];
  pie_chart_data: { name: string; value: number }[];
};

export type AnalyzeConceptExplanationInput = {
  conceptName: string;
  userTranscript: string;
  classLevel?: string;
};

export async function analyzeConceptExplanation(input: AnalyzeConceptExplanationInput): Promise<MasteryReportOutput> {
  const { conceptName, userTranscript, classLevel = 'Unknown' } = input;

  const prompt = `You are a strict but encouraging professor analyzing a student's explanation of a concept.
Provide a detailed mastery report based on their transcribed explanation.

Concept Name: ${conceptName}
Student's Explanation: "${userTranscript}"
Student Level: ${classLevel}

Analyze based on:
- Conceptual Clarity: How well did they explain the core idea?
- Examples Used: Did they use relevant examples?
- Confidence: Does the language sound confident? (look for filler words: um, uh, like)
- Technical Terminology: Did they use correct keywords?
- Conciseness: Was the explanation direct or full of repetition/fluff?

CRITICAL FORMATTING RULES:
1. MATHEMATICAL & SCIENTIFIC FORMULAS: Always convert every formula, equation, or calculation into proper LaTeX ($...$ for inline, $$...$$ for standalone block equations).
2. NEVER use raw slashes like "$/" or unformatted ASCII math.
3. Use simple, direct, engaging language with clear sub-points and real-life analogies where appropriate.

Respond with ONLY a valid JSON object (no markdown, pure JSON):
{
  "feedback_summary": "<constructive, encouraging critique with LaTeX equations formatted as $...$ or $$...$$>",
  "radar_chart_data": [
    {"metric": "Conceptual Clarity", "score": <0-100>},
    {"metric": "Examples Used", "score": <0-100>},
    {"metric": "Confidence", "score": <0-100>},
    {"metric": "Technical Terminology", "score": <0-100>},
    {"metric": "Conciseness", "score": <0-100>}
  ],
  "pie_chart_data": [
    {"name": "Fact", "value": <percent>},
    {"name": "Fluff", "value": <percent>},
    {"name": "Insight", "value": <percent>}
  ]
}

CRITICAL: pie_chart_data values MUST sum to exactly 100.`;

  const raw = await callOpenRouter([
    { role: 'user', content: prompt },
  ], undefined, true);

  const output = parseJsonResponse<MasteryReportOutput>(raw);

  if (!output?.radar_chart_data || !output?.pie_chart_data) {
    throw new Error("Failed to generate mastery report.");
  }

  // Normalize pie chart to sum 100
  const pieTotal = output.pie_chart_data.reduce((s, i) => s + i.value, 0);
  if (pieTotal > 0 && pieTotal !== 100) {
    let running = 0;
    output.pie_chart_data.forEach((item, idx) => {
      if (idx < output.pie_chart_data.length - 1) {
        const v = Math.round((item.value / pieTotal) * 100);
        item.value = v;
        running += v;
      } else {
        item.value = 100 - running;
      }
    });
  }

  return output;
}
