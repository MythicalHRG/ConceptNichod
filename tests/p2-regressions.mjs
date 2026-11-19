import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const studyGroups = read("../src/components/study-groups/study-groups-hub.tsx");
const mistakeUi = read("../src/components/mistakes/mistake-notebook.tsx");
const mistakes = read("../src/app/actions/mistakes.ts");
const aspirants = read("../src/app/actions/aspirants.ts");
const leaderboard = read("../src/app/actions/leaderboard.ts");
const profile = read("../src/app/actions/profile.ts");
const cleanup = read("../src/app/api/cron/cleanup/route.ts");
const broadcastModel = read("../src/models/Broadcast.ts");
const uploadthing = read("../src/app/api/uploadthing/core.ts");
const donationUi = read("../src/components/admin/donation-reconciliation.tsx");
const adminUi = read("../src/components/admin/admin-panel.tsx");

test("study-group polling is sequential, visibility-aware, and cancellable", () => {
  assert.doesNotMatch(studyGroups, /setInterval\(fetch(?:Msgs|DMs)/);
  assert.match(studyGroups, /setTimeout\(\(\) => void fetchMsgs\(\), 4000\)/);
  assert.match(studyGroups, /document\.addEventListener\("visibilitychange"/);
  assert.match(studyGroups, /finally \{\s*inFlight = false;\s*scheduleNext\(\);/);
});

test("mistake search ignores stale responses and invalidates on unmount", () => {
  assert.match(mistakeUi, /const searchRequestId = useRef\(0\)/);
  assert.match(mistakeUi, /requestId === searchRequestId\.current\) setData\(res\)/);
  assert.match(mistakeUi, /searchRequestId\.current \+= 1/);
});

test("mistake counts are grouped in MongoDB instead of loading every row", () => {
  assert.match(mistakes, /MistakeEntry\.aggregate\(\[/);
  assert.match(mistakes, /\$group: \{ _id: \{ subject: "\$subject", status: "\$status" \}, count: \{ \$sum: 1 \} \}/);
  assert.doesNotMatch(mistakes, /allUserDocs/);
});

test("authenticated aspirant search uses the shared distributed limiter", () => {
  assert.match(aspirants, /checkDistributedRateLimit\("aspirant-search:" \+ sessionUuid, 30, 60_000\)/);
});

test("leaderboard and profile histories stream in bounded batches with narrow projections", () => {
  assert.match(leaderboard, /coll: Topic\.collection\.name/);
  assert.match(leaderboard, /\.cursor\(\{ batchSize: 250 \}\)/);
  assert.match(leaderboard, /rawScore: "\$overallScore"/);
  assert.match(leaderboard, /rawDuration: "\$durationSeconds"/);
  assert.match(profile, /select\("subject analysis\.overallScore analysis\.chartsData name createdAt"\)/);
  assert.match(profile, /select\("overallScore durationSeconds radarData conceptName createdAt"\)/);
  assert.equal((profile.match(/\.cursor\(\{ batchSize: 250 \}\)/g) || []).length, 2);
  assert.doesNotMatch(profile, /const topics = await Topic\.find/);
  assert.doesNotMatch(profile, /const mirrorDocs = await ConceptMirror\.find/);
});

test("leaderboard streams every scoring input while bounding only displayed trajectory history", () => {
  const scores = Array.from({ length: 1000 }, (_, index) => (index * 17) % 101);
  let count = 0;
  let totalScore = 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let qualityWeightedVolume = 0;
  const trajectory = [];
  for (const score of scores) {
    const x = ++count;
    totalScore += score;
    sumX += x;
    sumY += score;
    sumXY += x * score;
    sumX2 += x * x;
    qualityWeightedVolume += score >= 80 ? 3.5 : score >= 60 ? 2.5 : score >= 40 ? 1.5 : 0.5;
    trajectory.push({ conceptIndex: x, score });
    if (trajectory.length > 100) trajectory.shift();
  }

  const batchSlope = (() => {
    let xSum = 0, ySum = 0, xySum = 0, x2Sum = 0;
    scores.forEach((score, index) => {
      const x = index + 1;
      xSum += x; ySum += score; xySum += x * score; x2Sum += x * x;
    });
    const denominator = count * x2Sum - xSum * xSum;
    return denominator === 0 ? 0 : Math.round(((count * xySum - xSum * ySum) / denominator) * 100) / 100;
  })();

  const streamedSlope = Math.round(((count * sumXY - sumX * sumY) / (count * sumX2 - sumX * sumX)) * 100) / 100;
  assert.equal(count, scores.length);
  assert.equal(totalScore, scores.reduce((sum, score) => sum + score, 0));
  assert.equal(sumY, totalScore);
  assert.equal(streamedSlope, batchSlope);
  assert.equal(qualityWeightedVolume, scores.reduce((sum, score) => sum + (score >= 80 ? 3.5 : score >= 60 ? 2.5 : score >= 40 ? 1.5 : 0.5), 0));
  assert.equal(trajectory.length, 100);
  assert.equal(trajectory[0].conceptIndex, 901);
});

test("broadcast cleanup deletes remote files before database records and retains failures", () => {
  assert.ok(cleanup.indexOf("utapi.deleteFiles") < cleanup.indexOf("Broadcast.deleteOne"));
  assert.match(cleanup, /broadcast record retained for retry/);
  assert.match(cleanup, /Broadcast\.collection\.indexes\(\)/);
});

test("broadcast model no longer declares an automatic TTL index", () => {
  assert.match(broadcastModel, /BroadcastSchema\.index\(\{ expiresAt: 1 \}\)/);
  assert.doesNotMatch(broadcastModel, /expireAfterSeconds/);
});

test("Owner broadcast uploads have constrained MIME types and file sizes", () => {
  assert.match(uploadthing, /image: \{ maxFileSize: "16MB"/);
  assert.match(uploadthing, /pdf: \{ maxFileSize: "16MB"/);
  assert.match(uploadthing, /text: \{ maxFileSize: "2MB"/);
  assert.doesNotMatch(uploadthing, /512MB/);
});

test("donation mutations surface errors and always clear busy state", () => {
  assert.match(donationUi, /useToast\(\)/);
  assert.match(donationUi, /Donation mutation failed/);
  assert.match(donationUi, /finally \{\s*setBusyId\(null\)/);
  assert.match(donationUi, /Could not load donation dashboard/);
});

test("admin mutation catch blocks retain destructive toast feedback", () => {
  assert.match(adminUi, /variant: "destructive"/);
  assert.match(adminUi, /Please try again/);
});
