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

test("leaderboard excludes unscored topics and never invents topic durations", () => {
  const leaderboard = read("src/app/actions/leaderboard.ts");
  assert.match(leaderboard, /const rawTopicScore = event\.analysisScore/);
  assert.match(leaderboard, /!Number\.isFinite\(rawTopicScore\)[\s\S]*?continue/);
  assert.match(leaderboard, /Topic practice duration is not recorded/);
  assert.match(leaderboard, /durationSeconds = 0/);
  assert.doesNotMatch(leaderboard, /isCompleted \? 70|isInProgress \? 40|isCompleted \? 180 : 60/);
  assert.doesNotMatch(leaderboard, /hasNonEmptyAnswer|hasAnswers:|practiceStatus: 1/);
});

test("reload during AI evaluation waits for the result, then retries only after the analysis lease expires", () => {
  const model = read("src/models/Topic.ts");
  const types = read("src/lib/types.ts");
  const action = read("src/app/actions.ts");
  const page = read("src/components/topic/topic-page-client.tsx");
  assert.match(model, /'analyzing'/);
  assert.match(model, /analysisStartedAt: \{ type: Date/);
  assert.match(types, /analysisStartedAt\?: Date/);
  assert.match(action, /analysisLeaseStaleBefore = new Date\(Date\.now\(\) - 120_000\)/);
  assert.match(action, /practiceStatus: "analyzing", analysisStartedAt: analysisLeaseStartedAt/);
  assert.match(action, /analysisStartedAt: analysisLeaseStartedAt, analysis: \{ \$exists: false \}/);
  assert.match(action, /\$unset: \{ analysisStartedAt: 1 \}/);
  assert.match(page, /initialTopic\.practiceStatus === "analyzing"/);
  assert.match(page, /router\.refresh\(\), 5_000/);
  assert.match(page, /handleAutoSubmit\(\{ \.\.\.initialTopic, practiceStatus: "in_progress" \}\)/);
});

test("legacy completed-without-analysis sessions are auto-submitted instead of shown as finished", () => {
  const page = read("src/components/topic/topic-page-client.tsx");
  const action = read("src/app/actions.ts");
  assert.match(page, /if \(initialTopic\.analysis\)/);
  assert.match(page, /initialTopic\.practiceStatus === "completed" \|\|[\s\S]*?handleAutoSubmit\(initialTopic\)/);
  assert.match(action, /A completed status without an analysis is an[\s\S]*?interrupted legacy lock/);
});

test("written assessment output never invents the total score or an authenticity verdict", () => {
  const flow = read("src/ai/flows/analyze-answers.ts");
  const ui = read("src/components/topic/final-analysis-display.tsx");
  assert.match(flow, /rawAnalysis\.overallScore < 0/);
  assert.match(flow, /rawAnalysis\.overallScore > 100/);
  assert.match(flow, /AI report did not contain a valid overall score/);
  assert.match(flow, /let authenticityReport: AuthenticityReport \| undefined/);
  assert.match(flow, /hasValidAuthenticityReport/);
  assert.doesNotMatch(flow, /isLowScore \? 35 : 85|: 20;/);
  assert.match(ui, /verdict === "unavailable" && "Not assessed"/);
  assert.match(ui, /No authorship estimate is available/);
});

test("question critique scores are kept only when the model actually returns a valid score", () => {
  const flow = read("src/ai/flows/analyze-answers.ts");
  assert.match(flow, /q\.scoreOutOf10 >= 0/);
  assert.match(flow, /q\.scoreOutOf10 <= 10/);
  assert.match(flow, /scoreOutOf10: Math\.round\(q\.scoreOutOf10 \* 10\) \/ 10/);
  assert.doesNotMatch(flow, /scoreOutOf10:[\s\S]{0,220}: 0/);
});
