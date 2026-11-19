import { createHash } from "crypto";
import type { RateLimitResult } from "@/lib/rate-limiter";
import dbConnect from "@/lib/mongoose";
import RateLimitCounter from "@/models/RateLimitCounter";

/**
 * Shared MongoDB-backed fixed-window limiter for serverless production.
 * Process-local helpers remain in rate-limiter.ts for isolated unit tests.
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

function hashKey(key: string) {
  if (typeof key !== "string" || !key.trim()) throw new Error("Invalid rate-limit key");
  return createHash("sha256").update(key).digest("hex");
}

function getWindow(key: string, windowMs: number, now: number) {
  if (!Number.isSafeInteger(windowMs) || windowMs <= 0) {
    throw new Error("Invalid rate-limit window");
  }
  const windowStart = Math.floor(now / windowMs) * windowMs;
  return { key: hashKey(key), windowStart, expiresAt: new Date(windowStart + windowMs * 2) };
}

function validateLimit(limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Invalid rate limit");
}

export async function checkDistributedRateLimit(
  key: string, limit: number, windowMs: number
): Promise<RateLimitResult> {
  validateLimit(limit);
  const now = Date.now();
  const window = getWindow(key, windowMs, now);
  await dbConnect();
  await ensureRateLimitIndexes();
  let counter: { count: number } | null = null;
  try {
    counter = await RateLimitCounter.findOneAndUpdate(
      { key: window.key, windowStart: window.windowStart },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: window.expiresAt } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
    counter = await RateLimitCounter.findOneAndUpdate(
      { key: window.key, windowStart: window.windowStart },
      { $inc: { count: 1 } },
      { new: true }
    ).lean();
  }
  if (!counter || !Number.isSafeInteger(counter.count) || counter.count < 1) {
    throw new Error("Rate-limit counter could not be confirmed; request denied");
  }
  const count = counter.count;
  return {
    success: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    resetMs: Math.max(0, window.windowStart + windowMs - now),
  };
}

export async function peekDistributedRateLimit(
  key: string, limit: number, windowMs: number
): Promise<RateLimitResult> {
  validateLimit(limit);
  const now = Date.now();
  const window = getWindow(key, windowMs, now);
  await dbConnect();
  await ensureRateLimitIndexes();
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
  const hashedKey = hashKey(key);
  await dbConnect();
  await RateLimitCounter.deleteMany({ key: hashedKey });
}
