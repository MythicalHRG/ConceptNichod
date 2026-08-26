import mongoose, { Schema, Document, Model } from "mongoose";

export interface IOtpVerification extends Document {
  email: string;
  otp: string;
  expiresAt: Date;
  isVerified: boolean;
}

const OtpVerificationSchema: Schema<IOtpVerification> = new Schema({
  email: { type: String, required: true, unique: true },
  otp: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  isVerified: { type: Boolean, default: false }
});

const OtpVerification: Model<IOtpVerification> = mongoose.models.OtpVerification || mongoose.model<IOtpVerification>("OtpVerification", OtpVerificationSchema);

export default OtpVerification;
