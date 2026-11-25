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
  assert.match(page, /initialSessionCheckDoneRef\.current/);
});

test("active test answers and final oral summary are autosaved to the owner-scoped topic", () => {
  const practice = read("src/components/topic/practice-analysis-section.tsx");
  const actions = read("src/app/actions.ts");
  const model = read("src/models/Topic.ts");
  assert.match(practice, /savedFinalSummarySpeech \|\| ""/);
  assert.match(practice, /updateTopicProgressAction\([\s\S]*?finalSummarySpeech/);
  assert.match(practice, /\}, 4000\)/);
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
