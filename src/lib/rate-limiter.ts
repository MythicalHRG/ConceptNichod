export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
}

// In-memory sliding window cache: key -> array of timestamps
const hitMap = new Map<string, number[]>();
const MAX_KEYS = 5000;

function cleanupOldEntries(now: number) {
  if (hitMap.size <= MAX_KEYS) return;

  for (const [key, timestamps] of hitMap.entries()) {
    if (
      timestamps.length === 0 ||
      now - timestamps[timestamps.length - 1] > 3600000
    ) {
      hitMap.delete(key);
    }
  }

  // Expired-key cleanup alone cannot enforce a bound during a burst of
  // distinct active keys. Evict least-recently-used keys to cap process memory.
  while (hitMap.size > MAX_KEYS) {
    const oldestKey = hitMap.keys().next().value;
    if (oldestKey === undefined) break;
    hitMap.delete(oldestKey);
  }
}

function touchEntry(key: string, timestamps: number[]) {
  hitMap.delete(key);
  hitMap.set(key, timestamps);
}

/**
 * Sliding window rate limiter.
 * Increments and checks whether the key is within the limit.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  const safeWindowMs = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 0;
  if (safeLimit < 1 || safeWindowMs <= 0) {
    return {
      success: false,
      limit: safeLimit,
      remaining: 0,
      resetMs: safeWindowMs,
    };
  }

  const now = Date.now();
  const windowStart = now - safeWindowMs;
  let timestamps = hitMap.get(key) || [];

  // Filter timestamps within the current sliding window
  timestamps = timestamps.filter((t) => t > windowStart);

  if (timestamps.length >= safeLimit) {
    const oldestInWindow = timestamps[0];
    const resetMs = Math.max(0, oldestInWindow + safeWindowMs - now);
    touchEntry(key, timestamps);
    cleanupOldEntries(now);
    return {
      success: false,
      limit: safeLimit,
      remaining: 0,
      resetMs,
    };
  }

  timestamps.push(now);
  touchEntry(key, timestamps);
  cleanupOldEntries(now);

  return {
    success: true,
    limit: safeLimit,
    remaining: Math.max(0, safeLimit - timestamps.length),
    resetMs: safeWindowMs,
  };
}

/**
 * Inspect rate limit status without consuming an attempt.
 */
export function peekRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  const safeWindowMs = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 0;
  if (safeLimit < 1 || safeWindowMs <= 0) {
    return {
      success: false,
      limit: safeLimit,
      remaining: 0,
      resetMs: safeWindowMs,
    };
  }

  const now = Date.now();
  const windowStart = now - safeWindowMs;
  let timestamps = hitMap.get(key) || [];
  timestamps = timestamps.filter((t) => t > windowStart);

  if (timestamps.length === 0) {
    hitMap.delete(key);
  }

  if (timestamps.length >= safeLimit) {
    const oldestInWindow = timestamps[0];
    const resetMs = Math.max(0, oldestInWindow + safeWindowMs - now);
    return {
      success: false,
      limit: safeLimit,
      remaining: 0,
      resetMs,
    };
  }

  return {
    success: true,
    limit: safeLimit,
    remaining: Math.max(0, safeLimit - timestamps.length),
    resetMs:
      timestamps.length > 0 ? Math.max(0, timestamps[0] + safeWindowMs - now) : 0,
  };
}

/**
 * Record a failed attempt (e.g. for failed login).
 */
export function recordFailedAttempt(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  return checkRateLimit(key, limit, windowMs);
}

/**
 * Reset rate limit counter for a specific key (e.g. after successful login).
 */
export function resetRateLimit(key: string): void {
  hitMap.delete(key);
}
