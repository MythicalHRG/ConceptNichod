import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("starting a practice session is persisted as in-progress before questions render", () => {
  const actions = read("src/app/actions.ts");
  const page = read("src/components/topic/topic-page-client.tsx");
  const startAction = actions.slice(
    actions.indexOf("export async function markSummaryViewedAction("),
    actions.indexOf("export async function updateTopicProgressAction(")
  );
  assert.match(startAction, /practiceStatus:\s*\{\s*\$ne:\s*"completed"\s*\}/);
  assert.match(startAction, /summaryViewed:\s*true,\s*practiceStatus:\s*"in_progress"/);
  assert.match(page, /markSummaryViewedAction\(topicId\)[\s\S]*?\.then\(\(\) => \{[\s\S]*?setIsPracticing\(true\)/);
  assert.match(page, /Could Not Start Test/);
});

test("reload of an active or already-opened test auto-submits persisted answers", () => {
  const page = read("src/components/topic/topic-page-client.tsx");
  assert.match(page, /initialTopic\.practiceStatus === "in_progress" \|\| initialTopic\.summaryViewed/);
  assert.match(page, /title: "Session Auto-Submitted"/);
  assert.doesNotMatch(page, /title: "Session Restored"/);
  assert.match(page, /currentTopic\.savedFinalSummarySpeech\?\.trim\(\)/);
  assert.match(page, /initialSessionCheckedTopicRef\.current/);
});

test("active test answers and final oral summary are autosaved to the owner-scoped topic", () => {
  const practice = read("src/components/topic/practice-analysis-section.tsx");
  const actions = read("src/app/actions.ts");
  const model = read("src/models/Topic.ts");
  assert.match(practice, /savedFinalSummarySpeech \|\| ""/);
  assert.match(practice, /updateTopicProgressAction\([\s\S]*?finalSummarySpeech/);
  assert.match(practice, /\}, 1500\)/);
  assert.match(actions, /savedFinalSummarySpeech: string = ""/);
  assert.match(actions, /savedFinalSummarySpeech,/);
  assert.match(model, /savedFinalSummarySpeech: \{ type: String, default: "", maxlength: 5000 \}/);
});

test("profile learning curve combines chronological written-test and Concept Mirror sessions", () => {
  const profile = read("src/app/actions/profile.ts");
  assert.match(profile, /recentAnalyzedTopics\.map/);
  assert.match(profile, /recentMirrorProgression\.map/);
  assert.match(profile, /\.sort\(\(a, b\) => a\.createdAt\.getTime\(\) - b\.createdAt\.getTime\(\)\)/);
  assert.doesNotMatch(profile, /learningProgression\.length === 0/);
});

test("profile radar only plots recorded assessment dimensions, not activity-count-derived scores", () => {
  const analytics = read("src/components/profile/user-analytics.tsx");
  assert.match(analytics, /const hasRadarData = pentagonData\.length > 0/);
  assert.match(analytics, /No measured performance dimensions are available yet/);
  assert.doesNotMatch(analytics, /activityScore|fallbackAxes/);
});

test("written-test analytics never manufacture chart dimensions or authorship confidence", () => {
  const display = read("src/components/topic/final-analysis-display.tsx");
  assert.doesNotMatch(display, /DEFAULT_PENTAGON_AXES|defaultSuite|baseScore \* 1\.05|naturalScore \? 88|safeOverallScore >= 40/);
  assert.match(display, /No verified performance charts were returned/);
  assert.match(display, /No authorship estimate is available/);
  assert.match(display, /hasAuthenticityReport/);
});

test("Concept Mirror marks missing fluff and overall scores as unassessed", () => {
  const flow = read("src/ai/flows/analyze-concept-explanation.ts");
  const ui = read("src/components/concept-mirror/mastery-dashboard.tsx");
  assert.match(flow, /fluffPercentage = fluffItem \? fluffItem\.value : null/);
  assert.match(ui, /fluffPercent === null \? "—" :/);
  assert.match(ui, /Fewer than three verified performance dimensions/);
  assert.match(ui, /Overall score not returned/);
  assert.doesNotMatch(ui, /avgClarity|: avgClarity/);
});

test("written-test radar charts require enough real metrics and authenticity is never inferred from the total", () => {
  const display = read("src/components/topic/final-analysis-display.tsx");
  assert.match(display, /return unique\.length >= 3 \? unique : \[\]/);
  assert.match(display, /No authorship estimate is available/);
  assert.doesNotMatch(display, /safeOverallScore >= 40|isNatural \\? 88|baseScore \\* 1\\.05/);
});

test("profile KPI cards show no assessment as unavailable, not a zero-percent score", () => {
  const profile = read("src/components/profile/user-analytics.tsx");
  assert.match(profile, /hasWrittenAssessmentData/);
  assert.match(profile, /No completed written assessments yet/);
  assert.match(profile, /mirrorData\.totalSessions > 0/);
  assert.doesNotMatch(profile, /data\.averageScore \|\| 0/);
});

test("single Concept Mirror responses cannot generate a synthetic longitudinal learning curve", () => {
  const flow = read("src/ai/flows/analyze-concept-explanation.ts");
  const ui = read("src/components/concept-mirror/mastery-dashboard.tsx");
  assert.match(flow, /"polynomial_chart_data": \[\]/);
  assert.match(flow, /polynomialChartData: \{ step: string; score: number \}\[\] = \[\]/);
  assert.match(ui, /const safePolyData: \{ step: string; score: number \}\[\] = \[\]/);
  assert.match(ui, /A single explanation cannot form a learning curve/);
  assert.doesNotMatch(ui, /report\.polynomial_chart_data\.filter/);
});

test("profile AI receives null for unassessed written and oral scores, never zero", () => {
  const source = read("src/app/actions/profile-ai.ts");
  assert.match(source, /writtenAverageScore: hasWrittenAssessments \? profileData\.averageScore : null/);
  assert.match(source, /averageOralScore: hasOralAssessments \? profileData\.conceptMirror\?\.averageScore : null/);
  assert.match(source, /Treat null score fields and empty assessment distributions as not assessed/);
});
