import mongoose, { Schema, Document, Model } from "mongoose";

export interface IOtpVerification extends Document {
  email: string;
  otp: string;
  expiresAt: Date;
  isVerified: boolean;
  attempts: number;
  lastSentAt: Date;
}

const OtpVerificationSchema: Schema<IOtpVerification> = new Schema({
  email: { type: String, required: true, unique: true },
  otp: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  isVerified: { type: Boolean, default: false },
  attempts: { type: Number, default: 0 },
  lastSentAt: { type: Date, default: Date.now }
});

// TTL index to automatically prune expired OTPs from the database
OtpVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const OtpVerification: Model<IOtpVerification> = mongoose.models.OtpVerification || mongoose.model<IOtpVerification>("OtpVerification", OtpVerificationSchema);

export default OtpVerification;
