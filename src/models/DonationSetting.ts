import mongoose, { Schema, Document } from "mongoose";

export interface IDonationSetting extends Document {
  upiId: string;
  qrCodeUrl: string;
  customInstructions: string;
  thankYouNote: string;
  updatedAt: Date;
}

const DonationSettingSchema = new Schema<IDonationSetting>(
  {
    upiId: { type: String, default: "" },
    qrCodeUrl: { type: String, default: "/qr.png" },
    customInstructions: { 
      type: String, 
      default: "Pay using any UPI app, then submit your transaction reference. Donations appear on the Hall of Patrons only after bank reconciliation." 
    },
    thankYouNote: { 
      type: String, 
      default: "Thank you for empowering free, high-quality, concept-first education for every student." 
    },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.models.DonationSetting || 
  mongoose.model<IDonationSetting>("DonationSetting", DonationSettingSchema);
