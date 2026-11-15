import { createHash } from "crypto";
import dbConnect from "@/lib/mongoose";
import RateLimitCounter from "@/models/RateLimitCounter";

/**
 * Shared MongoDB-backed fixed-window limiter for serverless production.
 * Unlike the process-local helpers above (kept for isolated unit tests),
 * this stores counters centrally so all Vercel instances share one quota.
 */
let rateLimitIndexesReady: Promise<unknown> | null = null;

async function ensureRateLimitIndexes() {
  if (!rateLimitIndexesReady) {
    rateLimitIndexesReady = Promise.all([
      RateLimitCounter.collection.createIndex({ key: 1, windowStart: 1 }, { unique: true }),
      RateLimitCounter.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]).catch((error) => {
      rateLimitIndexesReady = null;
      throw error;
    });
  }
  await rateLimitIndexesReady;
}

function getWindow(key: string, windowMs: number, now: number) {
  if (!key || !Number.isSafeInteger(windowMs) || windowMs <= 0) {
    throw new Error("Invalid rate-limit key or window");
  }
  const hashedKey = createHash("sha256").update(key).digest("hex");
  const windowStart = Math.floor(now / windowMs) * windowMs;
  return { key: hashedKey, windowStart, expiresAt: new Date(windowStart + windowMs * 2) };
}

export async function checkDistributedRateLimit(
  key: string, limit: number, windowMs: number
): Promise<RateLimitResult> {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Invalid rate limit");
  await dbConnect();
  await ensureRateLimitIndexes();
  const now = Date.now();
  const window = getWindow(key, windowMs, now);
  let counter: { count: number } | null = null;
  try {
    counter = await RateLimitCounter.findOneAndUpdate(
      { key: window.key, windowStart: window.windowStart },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: window.expiresAt } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
  } catch (error: any) {
    // Concurrent first writes can race on the unique compound index.
    if (error?.code !== 11000) throw error;
    counter = await RateLimitCounter.findOneAndUpdate(
      { key: window.key, windowStart: window.windowStart },
      { $inc: { count: 1 } },
      { new: true }
    ).lean();
  }
  const count = counter?.count ?? 0;
  const resetMs = Math.max(0, window.windowStart + windowMs - now);
  return {
    success: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    resetMs,
  };
}

export async function peekDistributedRateLimit(
  key: string, limit: number, windowMs: number
): Promise<RateLimitResult> {
  await dbConnect();
  await ensureRateLimitIndexes();
  const now = Date.now();
  const window = getWindow(key, windowMs, now);
  const counter = await RateLimitCounter.findOne({
    key: window.key, windowStart: window.windowStart
  }).lean();
  const count = counter?.count ?? 0;
  return {
    success: count < limit,
    limit,
    remaining: Math.max(0, limit - count),
    resetMs: Math.max(0, window.windowStart + windowMs - now),
  };
}

export async function recordDistributedFailedAttempt(
  key: string, limit: number, windowMs: number
): Promise<RateLimitResult> {
  return checkDistributedRateLimit(key, limit, windowMs);
}

export async function resetDistributedRateLimit(key: string): Promise<void> {
  await dbConnect();
  await RateLimitCounter.deleteMany({ key });
}
