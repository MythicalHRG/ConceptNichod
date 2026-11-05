import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ============================================================================
// TAREEKA 24: CONCEPT MIRROR, STOPWATCH, NO MANUAL TYPING & PROFILE ANALYTICS
// ============================================================================

test("Tareeka 24.1: Concept Mirror contains NO manual typing and is strictly read-only speech transcript", () => {
  const filePath = path.resolve("src/components/concept-mirror/mastery-dashboard.tsx");
  const content = fs.readFileSync(filePath, "utf-8");

  assert.ok(
    content.includes("readOnly"),
    "Concept Mirror textarea must be readOnly"
  );
  assert.ok(
    !content.includes("setManualTranscript"),
    "Must not allow manual typing into textarea"
  );
  assert.ok(
    !content.includes("Speech Transcript or Typed"),
    "Must eliminate 'Speech Transcript or Typed' label"
  );
});

test("Tareeka 24.2: Concept Mirror features a live stopwatch timer and reset button without any pause button", () => {
  const filePath = path.resolve("src/components/concept-mirror/mastery-dashboard.tsx");
  const content = fs.readFileSync(filePath, "utf-8");

  assert.ok(
    content.includes("elapsedSeconds") && content.includes("formatStopwatch"),
    "Concept Mirror must define stopwatch elapsed timer"
  );
  assert.ok(
    content.includes("Timer"),
    "Concept Mirror must render Timer icon"
  );
  assert.ok(
    content.includes("handleResetSpeech") || content.includes("resetTranscript"),
    "Concept Mirror must feature a reset button"
  );
  assert.ok(
    !content.includes("togglePause") && !content.includes('"Pause"'),
    "Concept Mirror must NOT have a pause button"
  );
});

test("Tareeka 24.3: Faaltu and bot-like text are completely eliminated from Concept Mirror and entire site", () => {
  const filePath = path.resolve("src/components/concept-mirror/mastery-dashboard.tsx");
  const content = fs.readFileSync(filePath, "utf-8");

  assert.ok(
    !content.includes("Native browser Web Speech recognition"),
    "Must not display 'Native browser Web Speech recognition'"
  );
  assert.ok(
    !content.includes("No API keys required"),
    "Must not display 'No API keys required'"
  );
  assert.ok(
    !content.includes("Analyzing with OpenRouter AI..."),
    "Must not display 'Analyzing with OpenRouter AI...'"
  );
});

test("Tareeka 24.4: Nichod SpeechRecorder eliminates pause button, retains reset button and timer", () => {
  const filePath = path.resolve("src/components/topic/speech-evaluator.tsx");
  const content = fs.readFileSync(filePath, "utf-8");

  assert.ok(
    !content.includes("togglePause") && !content.includes('variant="secondary"'),
    "SpeechRecorder must have no pause button"
  );
  assert.ok(
    content.includes("handleReset"),
    "SpeechRecorder must retain reset button"
  );
  assert.ok(
    content.includes("Timer") && content.includes("formatTime"),
    "SpeechRecorder must retain timer display"
  );
  assert.ok(
    content.includes("readOnly={true}"),
    "SpeechRecorder textarea must be readOnly"
  );
});

test("Tareeka 24.5: ConceptMirror model is defined and persisted in MongoDB", () => {
  const modelPath = path.resolve("src/models/ConceptMirror.ts");
  assert.ok(fs.existsSync(modelPath), "src/models/ConceptMirror.ts must exist");
  const content = fs.readFileSync(modelPath, "utf-8");

  assert.ok(content.includes("userId"), "Must store userId");
  assert.ok(content.includes("conceptName"), "Must store conceptName");
  assert.ok(content.includes("transcript"), "Must store transcript");
  assert.ok(content.includes("durationSeconds"), "Must store durationSeconds");
  assert.ok(content.includes("overallScore"), "Must store overallScore");
});

test("Tareeka 24.6: analyzeConceptExplanation records durationSeconds and saves to ConceptMirror", () => {
  const flowPath = path.resolve("src/ai/flows/analyze-concept-explanation.ts");
  const content = fs.readFileSync(flowPath, "utf-8");

  assert.ok(
    content.includes("ConceptMirror.create"),
    "analyzeConceptExplanation must persist session to ConceptMirror"
  );
  assert.ok(
    content.includes("durationSeconds"),
    "analyzeConceptExplanation must accept and store durationSeconds"
  );
});

test("Tareeka 24.7: getPublicProfileData returns conceptMirror analytics", () => {
  const profileActionPath = path.resolve("src/app/actions/profile.ts");
  const content = fs.readFileSync(profileActionPath, "utf-8");

  assert.ok(
    content.includes("ConceptMirror.find"),
    "getPublicProfileData must query ConceptMirror"
  );
  assert.ok(
    content.includes("conceptMirror:"),
    "getPublicProfileData must return conceptMirror object"
  );
  assert.ok(
    content.includes("totalSessions") && content.includes("averageScore") && content.includes("totalDurationSeconds"),
    "conceptMirror must include sessions, averageScore, and duration"
  );
});

test("Tareeka 24.8: UserAnalytics component renders dedicated Concept Mirror Oral Defense section", () => {
  const analyticsPath = path.resolve("src/components/profile/user-analytics.tsx");
  const content = fs.readFileSync(analyticsPath, "utf-8");

  assert.ok(
    content.includes("Concept Mirror: Oral Defense") || content.includes("Concept Mirror Mastery"),
    "UserAnalytics must render Concept Mirror mastery card"
  );
  assert.ok(
    content.includes("Oral Sessions"),
    "UserAnalytics must render Oral Sessions count"
  );
  assert.ok(
    content.includes("Time Explaining"),
    "UserAnalytics must render Time Explaining metric"
  );
});

test("Tareeka 24.9: Dashboard page eliminated 'free database goes to sleep' text", () => {
  const dashboardPath = path.resolve("src/app/dashboard/page.tsx");
  const content = fs.readFileSync(dashboardPath, "utf-8");

  assert.ok(
    !content.includes("free database"),
    "dashboard/page.tsx must not mention 'free database'"
  );
  assert.ok(
    !content.includes("goes to sleep"),
    "dashboard/page.tsx must not mention 'goes to sleep'"
  );
});
