import mongoose, { Model, Schema } from "mongoose";

interface IActionRateLimit {
  _id: string;
  count: number;
  expiresAt: Date;
}

const ActionRateLimitSchema = new Schema<IActionRateLimit>({
  _id: { type: String, required: true },
  count: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true },
}, { versionKey: false });

ActionRateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const ActionRateLimit: Model<IActionRateLimit> = mongoose.models.ActionRateLimit || mongoose.model<IActionRateLimit>("ActionRateLimit", ActionRateLimitSchema);
export default ActionRateLimit;
