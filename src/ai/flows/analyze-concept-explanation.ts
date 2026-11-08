'use server';

import { cookies } from 'next/headers';
import { callOpenRouter, parseJsonResponse } from '@/lib/openrouter';
import { verifySessionCookie } from '@/lib/session';
import dbConnect from '@/lib/mongoose';
import ConceptMirror from '@/models/ConceptMirror';

export type MasteryReportOutput = {
  feedback_summary: string;
  radar_chart_data: { metric: string; score: number }[];
  pie_chart_data: { name: string; value: number }[];
  bar_chart_data?: { name: string; score: number }[];
  polynomial_chart_data?: { step: string; score: number }[];
  overallScore?: number;
  durationSeconds?: number;
  fluffPercentage?: number;
};

export type AnalyzeConceptExplanationInput = {
  conceptName: string;
  userTranscript: string;
  classLevel?: string;
  durationSeconds?: number;
};

export async function analyzeConceptExplanation(input: AnalyzeConceptExplanationInput): Promise<MasteryReportOutput> {
  // Authentication check to prevent unauthenticated bot AI-scraping and token draining
  const rawSession = cookies().get('user_session')?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) {
    throw new Error('Please log in to analyze your concept explanation.');
  }

  const { conceptName, userTranscript, classLevel = 'Unknown', durationSeconds = 0 } = input;
  const allocatedTimeSeconds = 120; // 2 minutes maximum oral defense allocation
  const timeUtilizedPercent = Math.min(100, Math.round((durationSeconds / allocatedTimeSeconds) * 100));
  const wordCount = userTranscript.trim().split(/\s+/).filter(Boolean).length;

  const prompt = `You are a strict, world-class professor and oral defense examiner analyzing a student's verbal explanation of a concept.
Provide a detailed mastery report based on their transcribed explanation with comprehensive multi-chart visual analytics.

Concept Name: "${conceptName}"
Student Level: ${classLevel}
Allocated Defense Time Window: 2 Minutes (${allocatedTimeSeconds} seconds)
Actual Time Utilized by Student: ${durationSeconds} seconds (${timeUtilizedPercent}% of maximum allocated time)
Total Words Spoken: ${wordCount} words

Student's Spoken Explanation:
"${userTranscript}"

======================================================================
TIME UTILIZATION & ANTI-TRICKERY EVALUATION RULES:
======================================================================
1. MAXIMUM TIME UTILIZATION STANDARD (2-MINUTE BENCHMARK):
   - In Concept Nichod, students are allocated a maximum of 2 minutes (120 seconds) to provide a thorough, structured, and deep oral defense.
   - STUDENTS MUST NOT BE ABLE TO TRICK THE AI INTO HIGH MARKS BY MERELY SPEAKING FOR 10-15 SECONDS WITH A FEW SURFACE-LEVEL KEYWORDS!
   - A student who records for only 10, 15, 20, or 30 seconds clearly demonstrates limited knowledge, inability to elaborate, missing derivations, and lack of depth.
   - If duration is significantly below the 2-minute allowance (especially under 45 seconds) and the response lacks depth:
     * DEDUCT SIGNIFICANT POINTS from Overall Score, Conceptual Clarity, and Rigor.
     * In the "feedback_summary", explicitly call this out: State clearly that they had 2 full minutes to explain the concept, but only used ${durationSeconds} seconds (${timeUtilizedPercent}%), indicating a superficial grasp or inability to expand upon the core ideas.
     * Advise them specifically on what additional mechanisms, derivations, conditions, or nuances they should have filled their 2 minutes with.

2. RIGOROUS FLUFF AND PADDING AUDIT (% OF FLUFF IN GRAPHS):
   - You MUST critically measure the exact percentage of FLUFF in the content the user gave:
     * "Fact": Verifiable scientific/mathematical definitions, laws, formulas, causal mechanisms, and technical principles.
     * "Fluff": Low-value padding, conversational filler ("um", "uh", "you know", "basically", "so yeah", "like", "I think that's it"), vague hand-waving, circular repetitions, and stalling phrases that add zero informational value.
     * "Insight": Deep conceptual connections, intuitive analogies, edge cases, and higher-order applications.
   - IN "pie_chart_data", ACCURATELY SPECIFY THE FLUFF PERCENTAGE:
     [
       {"name": "Fact", "value": <percent>},
       {"name": "Fluff", "value": <percent>},
       {"name": "Insight", "value": <percent>}
     ]
     * If the student spoke very few substantive words, spent time stalling, or repeated the same point, ASSIGN A HIGH FLUFF PERCENTAGE (e.g. 40% - 75%).
     * If they gave a concise, fact-dense explanation, Fluff can be lower (e.g. 5% - 15%).
   - In "feedback_summary", explicitly mention the exact Fluff percentage (e.g. "Your explanation contained X% fluff/filler...") and point out where they used filler instead of technical substance.

3. EVALUATION DIMENSIONS (RADAR CHART):
   - Conceptual Clarity: How thoroughly and accurately did they explain the core idea? Penalize brevity and lack of causal explanations.
   - Examples Used: Did they use concrete, accurate examples?
   - Confidence: Speech fluency, lack of awkward stalling or trailing off early after a few seconds.
   - Technical Terminology: Proper keywords, units, and conditions.
   - Conciseness: Information density (penalize low substance and high fluff).

CRITICAL FORMATTING RULES:
1. MATHEMATICAL & SCIENTIFIC FORMULAS: Always convert every formula, equation, or calculation into proper LaTeX ($...$ for inline, $$...$$ for standalone block equations).
2. NEVER use raw slashes like "$/" or unformatted ASCII math.
3. Use simple, direct, engaging language with clear sub-points and real-life analogies where appropriate.

Respond with ONLY a valid JSON object (no markdown, pure JSON):
{
  "feedback_summary": "<constructive, rigorous critique mentioning their time utilization (${durationSeconds}s / 120s) and specific fluff percentage with LaTeX equations formatted as $...$ or $$...$$>",
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

  const overallScore = Math.round(
    output.radar_chart_data.reduce((s, r) => s + r.score, 0) /
      (output.radar_chart_data.length || 1)
  );
  output.overallScore = overallScore;
  output.durationSeconds = durationSeconds;
  const fluffItem = output.pie_chart_data.find((p) => p.name.toLowerCase() === 'fluff');
  output.fluffPercentage = fluffItem ? fluffItem.value : 0;

  // Fallback defaults if LLM omitted additional diverse charts
  if (!output.bar_chart_data || output.bar_chart_data.length === 0) {
    output.bar_chart_data = [
      { name: "Definitions", score: Math.min(100, Math.round(overallScore * 1.04)) },
      { name: "Core Principles", score: Math.round(overallScore) },
      { name: "Application", score: Math.max(20, Math.round(overallScore * 0.92)) },
      { name: "Edge Cases", score: Math.max(20, Math.round(overallScore * 0.85)) },
    ];
  }

  if (!output.polynomial_chart_data || output.polynomial_chart_data.length === 0) {
    output.polynomial_chart_data = [
      { step: "Initial Recall", score: Math.max(15, Math.round(overallScore * 0.7)) },
      { step: "Concept Framing", score: Math.max(25, Math.round(overallScore * 0.85)) },
      { step: "Analytical Nuance", score: Math.min(100, Math.round(overallScore * 0.95)) },
      { step: "Synthesis & Proof", score: Math.round(overallScore) },
      { step: "Final Mastery", score: Math.min(100, Math.round(overallScore * 1.08)) },
    ];
  }

  // Persist session to MongoDB for public profile analytics and mastery tracking
  try {
    await dbConnect();
    await ConceptMirror.create({
      userId: sessionUuid,
      conceptName: conceptName.trim(),
      transcript: userTranscript.trim(),
      durationSeconds: durationSeconds || 0,
      overallScore,
      feedbackSummary: output.feedback_summary,
      radarData: output.radar_chart_data,
      pieData: output.pie_chart_data,
    });
  } catch (dbErr) {
    console.warn("Could not persist ConceptMirror record:", dbErr);
  }

  return output;
}
