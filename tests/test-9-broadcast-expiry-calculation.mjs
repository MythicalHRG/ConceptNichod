import assert from "node:assert";
import test from "node:test";

function calculateBroadcastExpiry(baseDate, expiryHours) {
  const hours = parseFloat(expiryHours) || 36;
  return new Date(baseDate.getTime() + hours * 60 * 60 * 1000);
}

function filterActiveBroadcasts(broadcasts, currentTime) {
  return broadcasts.filter((b) => new Date(b.expiresAt) > currentTime);
}

test("Tareeka 9: Broadcast duration accurately computes future expiration timestamps", () => {
  const now = new Date("2026-11-04T10:00:00Z");

  const sixHours = calculateBroadcastExpiry(now, "6");
  assert.strictEqual(sixHours.toISOString(), "2026-11-04T16:00:00.000Z");

  const oneDay = calculateBroadcastExpiry(now, "24");
  assert.strictEqual(oneDay.toISOString(), "2026-11-05T10:00:00.000Z");

  const oneWeek = calculateBroadcastExpiry(now, "168");
  assert.strictEqual(oneWeek.toISOString(), "2026-11-11T10:00:00.000Z");
});

test("Tareeka 9: Expired broadcasts are strictly filtered out so users never see stale notices", () => {
  const now = new Date("2026-11-04T12:00:00Z");

  const list = [
    { subject: "Old Announcement", expiresAt: new Date("2026-11-04T08:00:00Z") }, // Expired 4h ago
    { subject: "Live Exam Broadcast", expiresAt: new Date("2026-11-04T18:00:00Z") }, // Active for next 6h
    { subject: "Weekend Hackathon", expiresAt: new Date("2026-11-06T12:00:00Z") },   // Active for next 2 days
  ];

  const active = filterActiveBroadcasts(list, now);
  assert.strictEqual(active.length, 2);
  assert.strictEqual(active[0].subject, "Live Exam Broadcast");
  assert.strictEqual(active[1].subject, "Weekend Hackathon");
});
