import mongoose, { Schema, Document, Model } from "mongoose";

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
    sender: { type: String, default: "mythicalhrg@gmail.com" },
    to: { type: [String], required: true },
    cc: { type: [String], default: [] },
    bcc: { type: [String], default: [] },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    attachmentUrl: { type: String, required: false },
    attachmentName: { type: String, required: false },
    sentCount: { type: Number, default: 0 },
    status: { type: String, enum: ["sent", "failed"], default: "sent" },
    error: { type: String, required: false },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const EmailBroadcast: Model<IEmailBroadcast> =
  mongoose.models.EmailBroadcast ||
  mongoose.model<IEmailBroadcast>("EmailBroadcast", EmailBroadcastSchema);

export default EmailBroadcast;
