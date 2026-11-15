import mongoose, { Schema, Document } from "mongoose";
import { PatronTier, computePatronTier } from "@/lib/donation-validation";

export type DonationTransactionStatus = "pending" | "verified" | "rejected";

export interface IDonationTransaction extends Document {
  uuid: string;
  userId?: string | null;
  userUuid: string;
  username: string;
  donorName: string;
  isAnonymous: boolean;
  utr: string;
  transactionId?: string | null;
  amount?: number | null;
  claimedAmount?: number | null;
  verifiedAmount?: number | null;
  status: DonationTransactionStatus;
  patronTier?: PatronTier | null;
  isPublishedToPatrons: boolean;
  donorRecordId?: string | null;
  recipientVpa?: string;
  verificationMethod?: "manual-bank-reconciliation";
  verifiedAt?: Date;
  verifiedBy?: string;
  message?: string;
  adminNote?: string;
  donatedAt: Date;
  isPublic: boolean;
  createdAt: Date;
}

const DonationTransactionSchema = new Schema<IDonationTransaction>({
  uuid: { type: String, required: true, unique: true },
  // Both fields intentionally remain strings: ConceptNichod user IDs are UUID strings.
  userId: { type: String, default: null, index: true },
  userUuid: { type: String, required: true, index: true },
  username: { type: String, required: true, trim: true, index: true },
  donorName: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
  isAnonymous: { type: Boolean, default: false },
  utr: { type: String, required: true, trim: true, match: /^\d{12}$/ },
  // Optional at schema level solely for legacy rows; every new public action requires it.
  transactionId: { type: String, trim: true, minlength: 6, maxlength: 45, sparse: true },
  amount: { type: Number, default: null, min: 0 },
  claimedAmount: { type: Number, default: null, min: 0 },
  verifiedAmount: { type: Number, default: null, min: 1 },
  status: { type: String, enum: ["pending", "verified", "rejected"], default: "pending", index: true },
  patronTier: { type: String, enum: ["Supporter", "Patron", "Benefactor", "Legend", null], default: null },
  isPublishedToPatrons: { type: Boolean, default: false, index: true },
  donorRecordId: { type: String, default: null },
  recipientVpa: { type: String, trim: true, lowercase: true },
  verificationMethod: { type: String, enum: ["manual-bank-reconciliation"] },
  verifiedAt: { type: Date },
  verifiedBy: { type: String },
  message: { type: String, default: "", maxlength: 250 },
  adminNote: { type: String, default: "", maxlength: 500 },
  donatedAt: { type: Date, default: Date.now, index: true },
  isPublic: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Existing UTR uniqueness is retained. Sparse transaction ID index keeps old documents valid.
DonationTransactionSchema.index({ utr: 1 }, { unique: true });
DonationTransactionSchema.index({ transactionId: 1 }, { unique: true, sparse: true });
DonationTransactionSchema.index({ status: 1, donatedAt: -1 });
DonationTransactionSchema.index({ status: 1, isPublishedToPatrons: 1, verifiedAmount: -1 });

DonationTransactionSchema.pre("save", function (next) {
  if (this.status !== "verified" || !this.verifiedAmount || this.verifiedAmount <= 0) {
    this.isPublishedToPatrons = false;
    this.patronTier = null;
    this.isPublic = false;
  } else {
    this.amount = this.verifiedAmount;
    if (!this.patronTier) this.patronTier = computePatronTier(this.verifiedAmount);
  }
  next();
});

export default mongoose.models.DonationTransaction ||
  mongoose.model<IDonationTransaction>("DonationTransaction", DonationTransactionSchema);
