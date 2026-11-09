import mongoose, { Schema, Document } from "mongoose";

export interface IDonor extends Document {
  uuid: string;
  username: string;
  userUuid?: string;
  amount: number;
  totalAmount?: number;
  donationCount?: number;
  tier: "Supporter" | "Patron" | "Benefactor" | "Legend";
  message?: string;
  latestMessage?: string;
  donatedAt: Date;
  lastDonatedAt?: Date;
  isPublic: boolean;
  createdAt: Date;
}

const DonorSchema = new Schema<IDonor>(
  {
    uuid: { type: String, required: true, unique: true },
    username: { type: String, required: true, trim: true, index: true },
    userUuid: { type: String, index: true },
    amount: { type: Number, required: true },
    totalAmount: { type: Number, default: 0 },
    donationCount: { type: Number, default: 1 },
    tier: { 
      type: String, 
      enum: ["Supporter", "Patron", "Benefactor", "Legend"], 
      default: "Supporter" 
    },
    message: { type: String, default: "" },
    latestMessage: { type: String, default: "" },
    donatedAt: { type: Date, default: Date.now },
    lastDonatedAt: { type: Date, default: Date.now },
    isPublic: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.models.Donor || mongoose.model<IDonor>("Donor", DonorSchema);
