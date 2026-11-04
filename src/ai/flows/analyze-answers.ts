'use server';

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
    "performanceSummary": "<string>",
    "areasToFocus": ["<string>"],
    "areasToImprove": ["<string>"],
    "keyTermsForBonus": ["<string>"],
    "extraTips": ["<string>"],
    "aiGeneratedAnswerIndices": [<indices of suspected AI-generated written answers>],
    "chartsData": "[{\"type\":\"bar\",\"title\":\"Topic Performance\",\"data\":[{\"name\":\"Comprehension\",\"score\":75},{\"name\":\"Expression\",\"score\":60},{\"name\":\"Critical Thinking\",\"score\":80}],\"config\":{\"score\":{\"label\":\"Score\",\"color\":\"hsl(var(--chart-1))\"}}},{\"type\":\"bar\",\"title\":\"Communication Skills\",\"data\":[{\"name\":\"Clarity\",\"score\":70},{\"name\":\"Conciseness\",\"score\":65},{\"name\":\"Confidence\",\"score\":75}],\"config\":{\"score\":{\"label\":\"Score\",\"color\":\"hsl(var(--chart-2))\"}}},{\"type\":\"pie\",\"title\":\"Personality Traits\",\"data\":[{\"name\":\"Openness\",\"value\":35,\"fill\":\"hsl(var(--chart-1))\"},{\"name\":\"Conscientiousness\",\"value\":35,\"fill\":\"hsl(var(--chart-2))\"},{\"name\":\"Extraversion\",\"value\":30,\"fill\":\"hsl(var(--chart-3))\"}]}]"
  }
}

CRITICAL: 
- chartsData MUST be a valid JSON string (escaped). Replace example numbers with actual evaluated scores.
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
