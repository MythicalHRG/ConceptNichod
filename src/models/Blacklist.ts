import mongoose, { Schema, Document, Model } from "mongoose";

export interface IBlacklist extends Document {
  type: "ip" | "email" | "username";
  value: string;
  reason?: string;
  createdAt: Date;
}

const BlacklistSchema: Schema<IBlacklist> = new Schema({
  type: { type: String, enum: ["ip", "email", "username"], required: true },
  value: { type: String, required: true, trim: true, lowercase: true },
  reason: { type: String, required: false, trim: true, maxlength: 500 },
  createdAt: { type: Date, default: Date.now }
});

// Ensure a combination of type and value is unique to prevent duplicate bans
BlacklistSchema.index({ type: 1, value: 1 }, { unique: true });

const Blacklist: Model<IBlacklist> = mongoose.models.Blacklist || mongoose.model<IBlacklist>("Blacklist", BlacklistSchema);

export default Blacklist;
