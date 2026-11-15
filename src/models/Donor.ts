import mongoose, { Schema, Document, Model } from "mongoose";
import { randomUUID } from "crypto";
import { PatronTier } from "@/lib/donation-validation";

export interface IDonor extends Document {
  uuid: string;
  userId?: string | null;
  userUuid?: string | null;
  username?: string | null;
  name: string;
  amount: number;
  totalAmount?: number;
  donationCount?: number;
  tier: PatronTier;
  message?: string;
  latestMessage?: string;
  isAnonymous: boolean;
  isVisible: boolean;
  isPublic: boolean;
  utr?: string;
  transactionId?: string | null;
  transactionRef?: string | null;
  verifiedBy?: string | null;
  donatedAt: Date;
  lastDonatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DonorSchema = new Schema<IDonor>({
  uuid: { type: String, required: true, unique: true, default: () => randomUUID() },
  userId: { type: String, default: null, index: true },
  userUuid: { type: String, default: null, index: true },
  username: { type: String, trim: true, default: null },
  name: { type: String, required: function (this: any) { return this.isNew; }, trim: true, maxlength: 60 },
  amount: { type: Number, required: true, min: [1, "Verified patron amount must be at least ₹1"] },
  // Old title-case tiers remain accepted for legacy records.
  tier: { type: String, enum: ["LEGEND", "DIAMOND", "GOLD", "SILVER", "SUPPORTER", "Legend", "Benefactor", "Patron", "Supporter"], default: "SUPPORTER" },
  message: { type: String, trim: true, maxlength: 250, default: "" },
  latestMessage: { type: String, default: "" },
  isAnonymous: { type: Boolean, default: false },
  isVisible: { type: Boolean, default: true, index: true },
  isPublic: { type: Boolean, default: true, index: true },
  utr: { type: String, trim: true, select: false },
  transactionId: { type: String, trim: true, select: false },
  transactionRef: { type: String, default: null, index: true },
  verifiedBy: { type: String, default: null },
  totalAmount: { type: Number, default: 0 },
  donationCount: { type: Number, default: 1 },
  donatedAt: { type: Date, default: Date.now },
  lastDonatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

DonorSchema.index({ isVisible: 1, amount: -1, donatedAt: -1 });
DonorSchema.index({ isPublic: 1, totalAmount: -1, lastDonatedAt: -1 });

export const Donor: Model<IDonor> =
  mongoose.models.Donor || mongoose.model<IDonor>("Donor", DonorSchema);
export default Donor;
