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
    upiId: { type: String, default: "harsh.2525@ptaxis" },
    qrCodeUrl: { type: String, default: "/qr.png" },
    customInstructions: { 
      type: String, 
      default: "Scan the QR code using Google Pay, PhonePe, Paytm, or BHIM UPI. Please mention your ConceptNichod username in the transaction notes so we can celebrate your support on the Hall of Patrons!" 
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
