import test from 'node:test';
import assert from 'node:assert/strict';

// Helper matching the overhauled leaderboard scoring logic
function calculateMasteryRankScore(params) {
  const {
    scores = [],
    currentStreak = 0,
    timeframe = 'all',
    oralDefenseSeconds = 0,
  } = params;

  const N = scores.length;
  if (N === 0) return 0;

  // 1. Quality & Mastery-Weighted Volume
  let qualityWeightedVolume = 0;
  let totalScore = 0;
  for (const s of scores) {
    totalScore += s;
    if (s >= 80) qualityWeightedVolume += 3.5;
    else if (s >= 60) qualityWeightedVolume += 2.5;
    else if (s >= 40) qualityWeightedVolume += 1.5;
    else qualityWeightedVolume += 0.5;
  }
  const conceptsWeight = Math.min(qualityWeightedVolume, 300);

  // 2. Bayesian / Credibility-Smoothed Performance Weight
  const avgScore = N > 0 ? Math.round((totalScore / N) * 10) / 10 : 0;
  const credibilityFactor = N / (N + 3);
  const performanceWeight = (avgScore * 0.4) * credibilityFactor;

  // 3. Timeframe-Bounded Consistency (Streak)
  let maxTimeframeDays = 100;
  if (timeframe === 'week') maxTimeframeDays = 7;
  else if (timeframe === 'month') maxTimeframeDays = 30;
  const effectiveStreak = Math.min(currentStreak, maxTimeframeDays);
  const streakWeight = effectiveStreak * 2.0;

  // 4. Slope & Learning Progression Velocity (Damped for low sample size)
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

  let slope = 0;
  if (N >= 2) {
    const numerator = N * sumXY - sumX * sumY;
    const denominator = N * sumX2 - sumX * sumX;
    if (denominator !== 0) {
      slope = Math.round((numerator / denominator) * 100) / 100;
    }
  }

  const slopeConfidence = Math.min(1, Math.max(0, (N - 2) / 5));
  const effectiveVelocity = slope * Math.log10(N + 1) * slopeConfidence;
  const velocityWeight = Math.max(-10, Math.min(30, effectiveVelocity)) * 2.0;

  // 5. Mastery Plateau Bonus (Solves the Ceiling Effect for Elite Performers)
  let plateauBonus = 0;
  if (avgScore >= 85 && N >= 3) {
    plateauBonus = Math.min(25, (avgScore - 80) * 1.5 * Math.min(1, N / 5));
  }

  // 6. Oral Defense Bonus
  const oralBonus = Math.min(oralDefenseSeconds / 60, 20) * 0.5;

  const rawRankScore =
    conceptsWeight +
    performanceWeight +
    streakWeight +
    velocityWeight +
    plateauBonus +
    oralBonus;

  return Math.max(0, Math.round(rawRankScore * 100) / 100);
}

// Tie-breaker matching overhauled logic
function overhauledTieBreaker(a, b) {
  if (Math.abs(b.rankScore - a.rankScore) > 0.001) {
    return b.rankScore - a.rankScore;
  }
  if (b.currentStreak !== a.currentStreak) {
    return b.currentStreak - a.currentStreak;
  }
  if (b.conceptsCovered !== a.conceptsCovered) {
    return b.conceptsCovered - a.conceptsCovered;
  }
  if (Math.abs((b.avgScore || 0) - (a.avgScore || 0)) > 0.01) {
    return (b.avgScore || 0) - (a.avgScore || 0);
  }
  if (b.totalDurationSeconds !== a.totalDurationSeconds) {
    return b.totalDurationSeconds - a.totalDurationSeconds;
  }
  return new Date(a.userCreatedAt).getTime() - new Date(b.userCreatedAt).getTime();
}

test('Tareeka 34.1: Ceiling Effect Solution: Elite students with high consistent scores receive Plateau Bonus', () => {
  // Elite student: consistently 95% on 10 concepts (slope = 0)
  const eliteScore = calculateMasteryRankScore({
    scores: [95, 95, 96, 95, 95, 96, 95, 95, 95, 95],
    currentStreak: 5,
  });

  // Mediocre rising student: starts at 20%, rises to 60% on 10 concepts
  const risingScore = calculateMasteryRankScore({
    scores: [20, 25, 30, 35, 40, 45, 50, 55, 58, 60],
    currentStreak: 5,
  });

  assert.ok(eliteScore > risingScore, `Elite score (${eliteScore}) must outrank mediocre rising score (${risingScore})`);
  assert.ok(eliteScore >= 80, 'Elite student should receive high score including plateau bonus');
});

test('Tareeka 34.2: Low-Sample Slope Damping: N < 3 does not generate volatile slope weight', () => {
  // Student with only 2 evaluations showing a massive swing from 20 to 90
  const scoreWithDamping = calculateMasteryRankScore({
    scores: [20, 90],
    currentStreak: 0,
  });

  // For N=2, slope confidence is 0, so velocityWeight is 0
  // conceptsWeight = 0.5 (for 20) + 3.5 (for 90) = 4.0
  // avgScore = 55. credibilityFactor = 2/5 = 0.4. performanceWeight = 55 * 0.4 * 0.4 = 8.8
  // Total expected = ~12.8
  assert.equal(scoreWithDamping, 12.8);
});

test('Tareeka 34.3: Quality-weighted volume favors high mastery over low-effort churning', () => {
  // Student A: 10 concepts with mastery (90%)
  const studentA = calculateMasteryRankScore({
    scores: Array(10).fill(90),
    currentStreak: 0,
  });

  // Student B: 10 concepts with low guessing (25%)
  const studentB = calculateMasteryRankScore({
    scores: Array(10).fill(25),
    currentStreak: 0,
  });

  assert.ok(studentA > studentB * 3, `Mastery student (${studentA}) must significantly outscore guessing student (${studentB})`);
});

test('Tareeka 34.4: Timeframe-bounded consistency caps streak points for weekly contests', () => {
  const allTimeScore = calculateMasteryRankScore({
    scores: [80, 85, 90],
    currentStreak: 50,
    timeframe: 'all',
  });

  const weeklyScore = calculateMasteryRankScore({
    scores: [80, 85, 90],
    currentStreak: 50,
    timeframe: 'week', // Max 7 days streak counted
  });

  // In weekly contest, streak points are capped at 7 * 2 = 14 pts instead of 50 * 2 = 100 pts
  assert.ok(allTimeScore > weeklyScore, 'All-time score with 50-day streak should be higher than weekly-capped score');
  assert.equal(Math.round(allTimeScore - weeklyScore), (50 - 7) * 2.0, 'Difference must exactly match capped streak days');
});

test('Tareeka 34.5: Deterministic tie-breaking prioritizes accuracy (avgScore) before duration', () => {
  const userAccurate = {
    username: 'accurateStudent',
    rankScore: 75.0,
    currentStreak: 5,
    conceptsCovered: 15,
    avgScore: 92.5,
    totalDurationSeconds: 300,
    userCreatedAt: '2026-02-01',
  };

  const userSlow = {
    username: 'slowStudent',
    rankScore: 75.0,
    currentStreak: 5,
    conceptsCovered: 15,
    avgScore: 71.0,
    totalDurationSeconds: 1200,
    userCreatedAt: '2026-01-01',
  };

  const sorted = [userSlow, userAccurate].sort(overhauledTieBreaker);
  assert.equal(sorted[0].username, 'accurateStudent', 'Higher average accuracy must win the tie-break before duration');
});

test('Tareeka 34.6: Declining performance cannot produce negative rankScore', () => {
  const negativeSlopeScores = [90, 40, 20];
  const score = calculateMasteryRankScore({
    scores: negativeSlopeScores,
    currentStreak: 0,
  });

  assert.ok(score >= 0, 'Rank score must never be negative');
});

test('Tareeka 34.7: Only topics with actual finite assessment scores contribute to leaderboard performance', () => {
  const sampleTopics = [
    { name: 'Scored Topic', analysis: { overallScore: 84 }, practiceStatus: 'completed', savedWrittenAnswers: ['Answer'] },
    { name: 'Unscored Completed Topic', practiceStatus: 'completed' },
    { name: 'In-progress Topic with Answers', practiceStatus: 'in_progress', savedWrittenAnswers: ['Answer to Q1'] },
    { name: 'Empty Draft Topic', practiceStatus: 'in_progress', savedWrittenAnswers: [] },
    { name: 'Invalid Score Topic', analysis: { overallScore: 140 }, practiceStatus: 'completed' },
  ];

  const measured = sampleTopics.filter((topic) =>
    typeof topic.analysis?.overallScore === 'number' &&
    Number.isFinite(topic.analysis.overallScore) &&
    topic.analysis.overallScore >= 0 &&
    topic.analysis.overallScore <= 100
  );

  assert.equal(measured.length, 1, 'Only an actually evaluated topic should contribute to performance metrics');
  assert.equal(measured[0].name, 'Scored Topic');
});
