import mongoose, { Schema, Document, Model } from "mongoose";

export interface IBroadcast extends Document {
  subject: string;
  message: string;
  fileUrl?: string; // Optional for future file storage
  createdAt: Date;
  expiresAt: Date;
}

const BroadcastSchema: Schema<IBroadcast> = new Schema({
  subject: { type: String, required: true },
  message: { type: String, required: true },
  fileUrl: { type: String, required: false },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }
});

// TTL index to automatically delete the broadcast when expiresAt is reached
// We set expireAfterSeconds to 0 so it relies strictly on the `expiresAt` date
BroadcastSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Broadcast: Model<IBroadcast> = mongoose.models.Broadcast || mongoose.model<IBroadcast>("Broadcast", BroadcastSchema);

export default Broadcast;
