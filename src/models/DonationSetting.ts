import mongoose, { Schema, Document, Model } from "mongoose";

export interface IDonationSetting extends Document {
  upiId: string;
  payeeName: string;
  qrCodeUrl: string;
  isEnabled: boolean;
  headline: string;
  subtext: string;
  customInstructions: string;
  thankYouNote: string;
  updatedBy?: string;
  updatedAt: Date;
}

const DonationSettingSchema = new Schema<IDonationSetting>({
  upiId: { type: String, default: "" },
  payeeName: { type: String, required: true, trim: true, default: process.env.NEXT_PUBLIC_UPI_NAME || "ConceptNichod" },
  qrCodeUrl: { type: String, trim: true, default: "/qr.png" },
  isEnabled: { type: Boolean, default: false },
  headline: { type: String, trim: true, default: "Support ConceptNichod & Join the Hall of Patrons" },
  subtext: { type: String, trim: true, default: "Scan the UPI QR code to donate any amount, then submit your 12-digit UTR and Transaction ID below for manual Admin verification." },
  // Legacy settings retained so older admin settings screens remain compatible.
  customInstructions: { type: String, default: "Pay using any UPI app, then submit your transaction reference for manual verification." },
  thankYouNote: { type: String, default: "Thank you for supporting ConceptNichod." },
  updatedBy: { type: String, default: null },
}, { timestamps: true });

export const DonationSetting: Model<IDonationSetting> =
  mongoose.models.DonationSetting ||
  mongoose.model<IDonationSetting>("DonationSetting", DonationSettingSchema);
export default DonationSetting;
