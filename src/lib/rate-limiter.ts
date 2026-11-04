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
  const now = Date.now();
  cleanupOldEntries(now);

  const windowStart = now - windowMs;
  let timestamps = hitMap.get(key) || [];

  // Filter timestamps within the current sliding window
  timestamps = timestamps.filter((t) => t > windowStart);

  if (timestamps.length >= limit) {
    const oldestInWindow = timestamps[0];
    const resetMs = Math.max(0, oldestInWindow + windowMs - now);
    hitMap.set(key, timestamps);
    return {
      success: false,
      limit,
      remaining: 0,
      resetMs,
    };
  }

  timestamps.push(now);
  hitMap.set(key, timestamps);

  return {
    success: true,
    limit,
    remaining: Math.max(0, limit - timestamps.length),
    resetMs: windowMs,
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
  const now = Date.now();
  const windowStart = now - windowMs;
  let timestamps = hitMap.get(key) || [];
  timestamps = timestamps.filter((t) => t > windowStart);

  if (timestamps.length >= limit) {
    const oldestInWindow = timestamps[0];
    const resetMs = Math.max(0, oldestInWindow + windowMs - now);
    return {
      success: false,
      limit,
      remaining: 0,
      resetMs,
    };
  }

  return {
    success: true,
    limit,
    remaining: Math.max(0, limit - timestamps.length),
    resetMs:
      timestamps.length > 0 ? Math.max(0, timestamps[0] + windowMs - now) : 0,
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
