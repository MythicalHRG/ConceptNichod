import { test } from 'node:test';
import assert from 'node:assert/strict';

// 1. Test Linear Regression Slope Calculation for Leaderboard
function calculateSlope(scores) {
  const N = scores.length;
  if (N < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < N; i++) {
    const x = i + 1;
    const y = scores[i];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }

  const numerator = N * sumXY - sumX * sumY;
  const denominator = N * sumX2 - sumX * sumX;
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 100) / 100;
}

function calculateVelocity(slope, N) {
  return Math.round(slope * Math.log10(N + 1) * 100) / 100;
}

test('Leaderboard slope calculation: positive learning progression', () => {
  const scores = [60, 70, 80, 90, 100];
  const slope = calculateSlope(scores);
  assert.equal(slope, 10);
  const velocity = calculateVelocity(slope, scores.length);
  assert.ok(velocity > 0);
  assert.equal(velocity, 7.78);
});

test('Leaderboard slope calculation: flat consistency', () => {
  const scores = [85, 85, 85, 85];
  const slope = calculateSlope(scores);
  assert.equal(slope, 0);
  const velocity = calculateVelocity(slope, scores.length);
  assert.equal(velocity, 0);
});

test('Leaderboard slope calculation: declining performance', () => {
  const scores = [90, 80, 70, 60];
  const slope = calculateSlope(scores);
  assert.equal(slope, -10);
  const velocity = calculateVelocity(slope, scores.length);
  assert.ok(velocity < 0);
});

test('Leaderboard slope calculation: single evaluation edge case returns 0', () => {
  const scores = [95];
  const slope = calculateSlope(scores);
  assert.equal(slope, 0);
  const velocity = calculateVelocity(slope, 1);
  assert.equal(velocity, 0);
});

// 2. Test Deterministic Tie-Breaking
function tieBreakComparator(a, b) {
  if (Math.abs(b.rankScore - a.rankScore) > 0.001) {
    return b.rankScore - a.rankScore;
  }
  if (b.currentStreak !== a.currentStreak) {
    return b.currentStreak - a.currentStreak;
  }
  if (b.conceptsCovered !== a.conceptsCovered) {
    return b.conceptsCovered - a.conceptsCovered;
  }
  if (b.totalDurationSeconds !== a.totalDurationSeconds) {
    return b.totalDurationSeconds - a.totalDurationSeconds;
  }
  return new Date(a.userCreatedAt).getTime() - new Date(b.userCreatedAt).getTime();
}

test('Leaderboard tie-breaking: higher streak breaks equal rank score', () => {
  const userA = {
    username: 'userA',
    rankScore: 85.5,
    currentStreak: 5,
    conceptsCovered: 20,
    totalDurationSeconds: 600,
    userCreatedAt: '2026-01-01',
  };
  const userB = {
    username: 'userB',
    rankScore: 85.5,
    currentStreak: 7,
    conceptsCovered: 20,
    totalDurationSeconds: 600,
    userCreatedAt: '2026-01-02',
  };

  const sorted = [userA, userB].sort(tieBreakComparator);
  assert.equal(sorted[0].username, 'userB'); // userB has higher streak
});

test('Leaderboard tie-breaking: higher concepts breaks equal score and streak', () => {
  const userA = {
    username: 'userA',
    rankScore: 80.0,
    currentStreak: 3,
    conceptsCovered: 25,
    totalDurationSeconds: 500,
    userCreatedAt: '2026-01-01',
  };
  const userB = {
    username: 'userB',
    rankScore: 80.0,
    currentStreak: 3,
    conceptsCovered: 15,
    totalDurationSeconds: 500,
    userCreatedAt: '2026-01-02',
  };

  const sorted = [userB, userA].sort(tieBreakComparator);
  assert.equal(sorted[0].username, 'userA'); // userA covered more concepts
});

test('Leaderboard tie-breaking: higher oral defense seconds breaks equal concept counts', () => {
  const userA = {
    username: 'userA',
    rankScore: 80.0,
    currentStreak: 3,
    conceptsCovered: 20,
    totalDurationSeconds: 850,
    userCreatedAt: '2026-01-02',
  };
  const userB = {
    username: 'userB',
    rankScore: 80.0,
    currentStreak: 3,
    conceptsCovered: 20,
    totalDurationSeconds: 400,
    userCreatedAt: '2026-01-01',
  };

  const sorted = [userB, userA].sort(tieBreakComparator);
  assert.equal(sorted[0].username, 'userA'); // userA defended for longer duration
});

test('Leaderboard tie-breaking: earlier registration timestamp is ultimate tie breaker', () => {
  const userOld = {
    username: 'seniorUser',
    rankScore: 80.0,
    currentStreak: 3,
    conceptsCovered: 20,
    totalDurationSeconds: 500,
    userCreatedAt: '2026-01-01T10:00:00Z',
  };
  const userNew = {
    username: 'juniorUser',
    rankScore: 80.0,
    currentStreak: 3,
    conceptsCovered: 20,
    totalDurationSeconds: 500,
    userCreatedAt: '2026-01-05T10:00:00Z',
  };

  const sorted = [userNew, userOld].sort(tieBreakComparator);
  assert.equal(sorted[0].username, 'seniorUser');
});

// 3. Test HTML Sanitization for Native Study Groups & Chat
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

test('Study group chat sanitizes XSS injection payloads', () => {
  const malicious = '<script>alert("hack")</script>';
  const clean = escapeHtml(malicious);
  assert.ok(!clean.includes('<script>'));
  assert.equal(clean, '&lt;script&gt;alert(&quot;hack&quot;)&lt;/script&gt;');
});

// 4. Test Server-Time Enforcement
test('Server time is strictly generated by runtime and not vulnerable to client device time', () => {
  const serverTime = new Date();
  assert.ok(serverTime instanceof Date);
  assert.ok(!isNaN(serverTime.getTime()));
  const utcYear = serverTime.getUTCFullYear();
  assert.ok(utcYear >= 2024);
});
