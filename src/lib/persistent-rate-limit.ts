import ActionRateLimit from "@/models/ActionRateLimit";

export async function enforcePersistentRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const bucket = `${key}:${windowStart}`;
  const expiresAt = new Date(windowStart + windowMs + 60 * 60 * 1000);
  let record;
  try {
    record = await ActionRateLimit.findOneAndUpdate(
      { _id: bucket },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
    record = await ActionRateLimit.findOneAndUpdate(
      { _id: bucket }, { $inc: { count: 1 } }, { new: true },
    ).lean();
  }
  if (!record || record.count > limit) throw new Error("Too many requests. Try again later.");
}
