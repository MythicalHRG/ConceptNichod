import mongoose, { Schema, Document, Model } from "mongoose";
import { PLATFORM_OWNER_EMAIL } from "@/lib/owner-access";

export interface IEmailBroadcast extends Document {
  sender: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  attachmentUrl?: string;
  attachmentName?: string;
  sentCount: number;
  status: "sent" | "failed";
  error?: string;
  sentAt: Date;
}

const EmailBroadcastSchema: Schema<IEmailBroadcast> = new Schema(
  {
    sender: { type: String, trim: true, default: PLATFORM_OWNER_EMAIL },
    to: { type: [String], required: true },
    cc: { type: [String], default: [] },
    bcc: { type: [String], default: [] },
    subject: { type: String, required: true, trim: true, maxlength: 300 },
    body: { type: String, required: true },
    attachmentUrl: { type: String, required: false, trim: true, maxlength: 2048 },
    attachmentName: { type: String, required: false, trim: true, maxlength: 255 },
    sentCount: {
      type: Number,
      default: 0,
      min: 0,
      validate: { validator: (v: number) => Number.isSafeInteger(v) && v >= 0, message: "Sent count must be a non-negative integer" },
    },
    status: { type: String, enum: ["sent", "failed"], default: "sent" },
    error: { type: String, required: false, maxlength: 2000 },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

EmailBroadcastSchema.index({ sentAt: -1 });

const EmailBroadcast: Model<IEmailBroadcast> =
  mongoose.models.EmailBroadcast ||
  mongoose.model<IEmailBroadcast>("EmailBroadcast", EmailBroadcastSchema);

export default EmailBroadcast;
