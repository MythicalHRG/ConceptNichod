import mongoose, { Schema, Document, Model } from "mongoose";

export interface IBroadcast extends Document {
  subject: string;
  message: string;
  fileUrl?: string; // Optional for future file storage
  createdAt: Date;
  expiresAt: Date;
}

const BroadcastSchema: Schema<IBroadcast> = new Schema({
  subject: { type: String, required: true, trim: true, maxlength: 200 },
  message: { type: String, required: true, trim: true, maxlength: 10000 },
  fileUrl: { type: String, required: false, trim: true, maxlength: 2048 },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }
});

// Non-TTL index: cron must delete remote attachments before removing DB records.
BroadcastSchema.index({ expiresAt: 1 });
BroadcastSchema.index({ createdAt: -1 });

const Broadcast: Model<IBroadcast> = mongoose.models.Broadcast || mongoose.model<IBroadcast>("Broadcast", BroadcastSchema);

export default Broadcast;
