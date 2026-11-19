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

test("leaderboard and profile queries use narrow field projections", () => {
  assert.match(leaderboard, /analysis\.overallScore practiceStatus savedWrittenAnswers savedSpokenAnswers/);
  assert.match(leaderboard, /maxTimeMS\(15000\)/);
  assert.match(profile, /select\("subject analysis\.overallScore analysis\.chartsData name createdAt"\)/);
  assert.match(profile, /select\("overallScore durationSeconds radarData conceptName createdAt"\)/);
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
