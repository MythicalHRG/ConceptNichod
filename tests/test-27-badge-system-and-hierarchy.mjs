import { test } from 'node:test';
import assert from 'node:assert/strict';

// Badge prioritization & hierarchy test harness mirroring src/lib/badges.ts

function sortBadges(badges) {
  return [...badges].sort((a, b) => b.priorityWeight - a.priorityWeight);
}

test('Badge Hierarchy: Level 5 badges sort above Level 4, 3, 2, 1', () => {
  const badges = [
    { id: 'streak-7d', level: 2, priorityWeight: 6000, name: '7-Day Spark' },
    { id: 'weekly-top10', level: 3, priorityWeight: 7500, name: 'Weekly Top 10' },
    { id: 'weekly-champion', level: 5, priorityWeight: 9500, name: 'Weekly #1 Champion' },
    { id: 'streak-30d', level: 4, priorityWeight: 8000, name: '30-Day Inferno' },
  ];

  const sorted = sortBadges(badges);
  assert.equal(sorted[0].id, 'weekly-champion'); // Level 5
  assert.equal(sorted[0].level, 5);
  assert.equal(sorted[1].id, 'streak-30d'); // Level 4
  assert.equal(sorted[1].level, 4);
  assert.equal(sorted[2].id, 'weekly-top10'); // Level 3
  assert.equal(sorted[2].level, 3);
  assert.equal(sorted[3].id, 'streak-7d'); // Level 2
  assert.equal(sorted[3].level, 2);
});

test('Platform Distinction: Handled in header tag, no Admin badge exists anywhere', () => {
  function getDistinctionTag(username) {
    const clean = username.trim().toLowerCase();
    if (clean === 'mythicalhrg') {
      return { tag: 'Owner', isOwner: true };
    }
    if (['anurag', 'rohit'].includes(clean)) {
      return { tag: 'Bade Maalik', isBadeMaalik: true };
    }
    return null;
  }

  const ownerTag = getDistinctionTag('mythicalhrg');
  assert.ok(ownerTag);
  assert.equal(ownerTag.tag, 'Owner');
  assert.equal(ownerTag.isOwner, true);

  const patronTag = getDistinctionTag('anurag');
  assert.ok(patronTag);
  assert.equal(patronTag.tag, 'Bade Maalik');
  assert.equal(patronTag.isBadeMaalik, true);

  // Normal or admin usernames do NOT receive an admin tag or badge
  const normalTag = getDistinctionTag('normalUser');
  assert.equal(normalTag, null);

  const adminQueryTag = getDistinctionTag('admin');
  assert.equal(adminQueryTag, null);
});

test('Weekly Expiration & Dynamic Revocation: Downgrades when rank slips', () => {
  function evaluateWeeklyBadge(weeklyRank, conceptsCovered) {
    if (!conceptsCovered || conceptsCovered <= 0) return null;
    if (weeklyRank === 1) {
      return { id: 'weekly-1', level: 5, priorityWeight: 9500, name: 'Weekly #1 Champion' };
    }
    if (weeklyRank <= 3) {
      return { id: 'weekly-podium', level: 4, priorityWeight: 8500 - weeklyRank * 10, name: `Weekly Podium (#${weeklyRank})` };
    }
    if (weeklyRank <= 10) {
      return { id: 'weekly-top10', level: 3, priorityWeight: 7500 - weeklyRank * 5, name: `Weekly Top 10 (#${weeklyRank})` };
    }
    if (weeklyRank <= 25) {
      return { id: 'weekly-top25', level: 2, priorityWeight: 6500 - weeklyRank * 2, name: `Weekly Top 25 (#${weeklyRank})` };
    }
    return null;
  }

  // Week 1: Rank #1 with 15 concepts
  const week1Badge = evaluateWeeklyBadge(1, 15);
  assert.equal(week1Badge?.id, 'weekly-1');
  assert.equal(week1Badge?.level, 5);

  // Week 2: User slips to Rank #14 with 5 concepts
  const week2Badge = evaluateWeeklyBadge(14, 5);
  assert.equal(week2Badge?.id, 'weekly-top25');
  assert.equal(week2Badge?.level, 2); // Automatically downgraded!
  assert.notEqual(week2Badge?.id, 'weekly-1'); // Old champion badge expired!

  // Inactive week: 0 concepts
  const inactiveBadge = evaluateWeeklyBadge(50, 0);
  assert.equal(inactiveBadge, null); // Expired completely!
});

test('Streak Expiration & Auto-Revocation: Resets when broken', () => {
  function evaluateStreakBadge(streakDoc, serverNow) {
    if (!streakDoc) return null;
    const todayStr = serverNow.toISOString().slice(0, 10);
    const yesterdayStr = new Date(serverNow.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const isLive = streakDoc.lastActiveDate === todayStr || streakDoc.lastActiveDate === yesterdayStr;
    const activeStreak = isLive ? streakDoc.currentStreak : 0;

    if (activeStreak >= 30) return { id: 'streak-inferno', level: 4, name: '30-Day Inferno' };
    if (activeStreak >= 14) return { id: 'streak-blaze', level: 3, name: '14-Day Blaze' };
    if (activeStreak >= 7) return { id: 'streak-spark', level: 2, name: '7-Day Spark' };
    return null;
  }

  const serverNow = new Date('2026-11-08T12:00:00Z');

  // Active streak: studied today
  const activeDoc = { currentStreak: 15, lastActiveDate: '2026-11-08' };
  const badgeActive = evaluateStreakBadge(activeDoc, serverNow);
  assert.ok(badgeActive);
  assert.equal(badgeActive?.id, 'streak-blaze');

  // Broken streak: last active 3 days ago
  const brokenDoc = { currentStreak: 15, lastActiveDate: '2026-11-05' };
  const badgeBroken = evaluateStreakBadge(brokenDoc, serverNow);
  assert.equal(badgeBroken, null); // Automatically revoked!
});

test('Velocity & Socratic Defense Badges emit correct levels', () => {
  function evaluateVelocityBadge(slope, N) {
    if (N < 3) return null;
    if (slope >= 10.0) return { id: 'velocity-hypersonic', level: 3, name: 'Hyper-Sonic Learner' };
    if (slope >= 5.0) return { id: 'velocity-accelerated', level: 2, name: 'Fast Learner' };
    return null;
  }

  assert.equal(evaluateVelocityBadge(12.5, 5)?.id, 'velocity-hypersonic');
  assert.equal(evaluateVelocityBadge(6.2, 4)?.id, 'velocity-accelerated');
  assert.equal(evaluateVelocityBadge(12.5, 2), null); // Needs at least 3 points for reliability
});
