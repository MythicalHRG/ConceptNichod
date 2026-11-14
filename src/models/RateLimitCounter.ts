import mongoose, { Schema, type Model } from "mongoose";

export interface RateLimitCounterDocument {
  key: string;
  windowStart: number;
  count: number;
  expiresAt: Date;
}

const RateLimitCounterSchema = new Schema<RateLimitCounterDocument>({
  key: { type: String, required: true },
  windowStart: { type: Number, required: true },
  count: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true },
}, { versionKey: false });

RateLimitCounterSchema.index({ key: 1, windowStart: 1 }, { unique: true });
RateLimitCounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RateLimitCounter: Model<RateLimitCounterDocument> =
  (mongoose.models.RateLimitCounter as Model<RateLimitCounterDocument>) ||
  mongoose.model<RateLimitCounterDocument>("RateLimitCounter", RateLimitCounterSchema);

export default RateLimitCounter;
