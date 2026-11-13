import mongoose, { Schema, Document } from "mongoose";

export interface IDonationTransaction extends Document {
  uuid: string;
  utr: string;
  username: string;
  userUuid: string;
  amount: number;
  status?: "pending" | "verified" | "rejected";
  verifiedAmount?: number;
  recipientVpa?: string;
  verificationMethod?: "manual-bank-reconciliation";
  verifiedAt?: Date;
  verifiedBy?: string;
  message?: string;
  donatedAt: Date;
  isPublic: boolean;
  createdAt: Date;
}

const DonationTransactionSchema = new Schema<IDonationTransaction>(
  {
    uuid: { type: String, required: true, unique: true },
    utr: { 
      type: String, 
      required: true, 
      unique: true, 
      trim: true, 
      uppercase: true, 
      index: true 
    },
    username: { type: String, required: true, trim: true, index: true },
    userUuid: { type: String, required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ["pending", "verified", "rejected"], default: "pending", index: true },
    verifiedAmount: { type: Number, min: 1 },
    recipientVpa: { type: String, trim: true, lowercase: true },
    verificationMethod: { type: String, enum: ["manual-bank-reconciliation"] },
    verifiedAt: { type: Date },
    verifiedBy: { type: String },
    message: { type: String, default: "" },
    donatedAt: { type: Date, default: Date.now, index: true },
    isPublic: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Enforce unique index on UTR to guarantee zero duplicate submissions at the MongoDB engine layer
DonationTransactionSchema.index({ utr: 1 }, { unique: true });
DonationTransactionSchema.index({ status: 1, donatedAt: -1 });

export default mongoose.models.DonationTransaction || 
  mongoose.model<IDonationTransaction>("DonationTransaction", DonationTransactionSchema);
