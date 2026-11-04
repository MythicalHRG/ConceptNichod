'use server';

import { cookies } from 'next/headers';
import { callOpenRouter, parseJsonResponse } from '@/lib/openrouter';

export type MasteryReportOutput = {
  feedback_summary: string;
  radar_chart_data: { metric: string; score: number }[];
  pie_chart_data: { name: string; value: number }[];
  bar_chart_data?: { name: string; score: number }[];
  polynomial_chart_data?: { step: string; score: number }[];
};

export type AnalyzeConceptExplanationInput = {
  conceptName: string;
  userTranscript: string;
  classLevel?: string;
};

export async function analyzeConceptExplanation(input: AnalyzeConceptExplanationInput): Promise<MasteryReportOutput> {
  // Authentication check to prevent unauthenticated bot AI-scraping and token draining
  const sessionUuid = cookies().get('user_session')?.value;
  if (!sessionUuid) {
    throw new Error('Please log in to analyze your concept explanation.');
  }

  const { conceptName, userTranscript, classLevel = 'Unknown' } = input;

  const prompt = `You are a strict but encouraging professor analyzing a student's explanation of a concept.
Provide a detailed mastery report based on their transcribed explanation with comprehensive multi-chart visual analytics.

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
  ],
  "bar_chart_data": [
    {"name": "Definitions", "score": <0-100>},
    {"name": "Core Principles", "score": <0-100>},
    {"name": "Application", "score": <0-100>},
    {"name": "Edge Cases", "score": <0-100>}
  ],
  "polynomial_chart_data": [
    {"step": "Initial Recall", "score": <0-100>},
    {"step": "Concept Framing", "score": <0-100>},
    {"step": "Analytical Nuance", "score": <0-100>},
    {"step": "Synthesis & Proof", "score": <0-100>},
    {"step": "Final Mastery", "score": <0-100>}
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

  // Fallback defaults if LLM omitted additional diverse charts
  if (!output.bar_chart_data || output.bar_chart_data.length === 0) {
    const avgScore = Math.round(output.radar_chart_data.reduce((s, r) => s + r.score, 0) / (output.radar_chart_data.length || 1));
    output.bar_chart_data = [
      { name: "Definitions", score: Math.min(100, Math.round(avgScore * 1.04)) },
      { name: "Core Principles", score: Math.round(avgScore) },
      { name: "Application", score: Math.max(20, Math.round(avgScore * 0.92)) },
      { name: "Edge Cases", score: Math.max(20, Math.round(avgScore * 0.85)) },
    ];
  }

  if (!output.polynomial_chart_data || output.polynomial_chart_data.length === 0) {
    const avgScore = Math.round(output.radar_chart_data.reduce((s, r) => s + r.score, 0) / (output.radar_chart_data.length || 1));
    output.polynomial_chart_data = [
      { step: "Initial Recall", score: Math.max(15, Math.round(avgScore * 0.7)) },
      { step: "Concept Framing", score: Math.max(25, Math.round(avgScore * 0.85)) },
      { step: "Analytical Nuance", score: Math.min(100, Math.round(avgScore * 0.95)) },
      { step: "Synthesis & Proof", score: Math.round(avgScore) },
      { step: "Final Mastery", score: Math.min(100, Math.round(avgScore * 1.08)) },
    ];
  }

  return output;
}
