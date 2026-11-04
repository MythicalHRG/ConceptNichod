'use server';

import { cookies } from 'next/headers';
import { callOpenRouter, parseJsonResponse } from '@/lib/openrouter';

export type FinalAnalysisOutput = {
  overallScore: number;
  performanceSummary: string;
  areasToFocus: string[];
  areasToImprove: string[];
  keyTermsForBonus: string[];
  extraTips: string[];
  aiGeneratedAnswerIndices: number[];
  chartsData: string;
};

export type AnalyzeAnswersInput = {
  topicId: string;
  topic: string;
  summary: string;
  classLevel: string;
  writtenAnswers: { question: string; answer: string }[];
  spokenAnswers: { question: string; answer: string }[];
};

export async function analyzeAnswersFlow(input: AnalyzeAnswersInput): Promise<{ analysis: FinalAnalysisOutput }> {
  // Authentication check to prevent unauthenticated bot AI-scraping and token draining
  const sessionUuid = cookies().get('user_session')?.value;
  if (!sessionUuid) {
    throw new Error('Please log in to generate an analysis.');
  }

  const { topic, summary, classLevel, writtenAnswers, spokenAnswers } = input;

  const writtenSection = writtenAnswers.map((a, i) => `Q${i+1}: ${a.question}\nA: ${a.answer}`).join('\n\n');
  const spokenSection = spokenAnswers.map((a, i) => `Q${i+1}: ${a.question}\nA: ${a.answer}`).join('\n\n');

  const prompt = `You are an AI expert evaluating a student in the Indian education system.
Address the user directly using "you" and "your". DO NOT use "the student".

Topic: "${topic}"
Class Level: ${classLevel}

Original Summary:
${summary}

User's Written Answers:
${writtenSection}

User's Spoken Answers:
${spokenSection}

Analyze ALL answers. Assign an overallScore out of 100.
Deduct points for: missing info, poor confidence, vague answers, and AI-generated answers (overly formal/generic).
Critically detect AI-generated written answers.
Evaluate spoken answers for: Communication Skills (Clarity, Conciseness, Confidence) and Personality (Openness, Conscientiousness, Extraversion).

Respond with ONLY a valid JSON object (no markdown):
{
  "analysis": {
    "overallScore": <number 0-100>,
    "performanceSummary": "<string with LaTeX equations formatted as $...$ or $$...$$>",
    "areasToFocus": ["<string with LaTeX equations formatted as $...$ or $$...$$>"],
    "areasToImprove": ["<string with LaTeX equations formatted as $...$ or $$...$$>"],
    "keyTermsForBonus": ["<string with LaTeX equations formatted as $...$ or $$...$$>"],
    "extraTips": ["<string with LaTeX equations formatted as $...$ or $$...$$>"],
    "aiGeneratedAnswerIndices": [<indices of suspected AI-generated written answers>],
    "chartsData": "[{\"type\":\"bar\",\"title\":\"Cognitive Competencies\",\"data\":[{\"name\":\"Comprehension\",\"score\":78},{\"name\":\"Expression\",\"score\":68},{\"name\":\"Critical Thinking\",\"score\":82},{\"name\":\"Application\",\"score\":75}],\"config\":{\"score\":{\"label\":\"Score\",\"color\":\"hsl(var(--primary))\"}}},{\"type\":\"pie\",\"title\":\"Knowledge Composition\",\"data\":[{\"name\":\"Core Theory\",\"value\":45,\"fill\":\"#0088fe\"},{\"name\":\"Applied Logic\",\"value\":35,\"fill\":\"#00c49f\"},{\"name\":\"Empirical Insights\",\"value\":20,\"fill\":\"#ffbb28\"}]},{\"type\":\"histo\",\"title\":\"Response Depth Distribution\",\"data\":[{\"name\":\"0-25% Recall\",\"score\":2},{\"name\":\"26-50% Foundational\",\"score\":4},{\"name\":\"51-75% Analytical\",\"score\":3},{\"name\":\"76-100% Comprehensive\",\"score\":2}],\"config\":{\"score\":{\"label\":\"Answers Count\",\"color\":\"#10b981\"}}},{\"type\":\"polynomial\",\"title\":\"Mastery Progression Curve\",\"data\":[{\"step\":\"Stage 1: Recall\",\"score\":55},{\"step\":\"Stage 2: Framing\",\"score\":68},{\"step\":\"Stage 3: Application\",\"score\":76},{\"step\":\"Stage 4: Synthesis\",\"score\":84},{\"step\":\"Stage 5: Peak Mastery\",\"score\":90}],\"config\":{\"score\":{\"label\":\"Trajectory\",\"color\":\"#6366f1\"}}},{\"type\":\"radar\",\"title\":\"Delivery & Articulation Matrix\",\"data\":[{\"metric\":\"Clarity\",\"score\":80},{\"metric\":\"Conciseness\",\"score\":72},{\"metric\":\"Confidence\",\"score\":85},{\"metric\":\"Technical Precision\",\"score\":78},{\"metric\":\"Structure\",\"score\":80}]}]"
  }
}

CRITICAL: 
- chartsData MUST be a valid JSON string (escaped). Each chart MUST be of a DIFFERENT type: [bar, pie, histo, polynomial, radar].
- NO DUPLICATE chart types in chartsData.
- Replace example numbers with actual evaluated scores.
- NO null values anywhere. Use [] for empty arrays. Use 0 for missing scores.`;

  const raw = await callOpenRouter([
    { role: 'user', content: prompt },
  ], undefined, true);

  const output = parseJsonResponse<{ analysis: FinalAnalysisOutput }>(raw);

  if (!output?.analysis) {
    throw new Error("The AI model failed to generate analysis. Please try again.");
  }

  // Ensure chartsData is a valid string
  if (typeof output.analysis.chartsData !== 'string') {
    output.analysis.chartsData = JSON.stringify(output.analysis.chartsData);
  }

  return output;
}
