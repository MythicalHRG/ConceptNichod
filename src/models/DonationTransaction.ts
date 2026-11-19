import mongoose, { Schema, Document, Model } from "mongoose";
import { randomUUID } from "crypto";
import { PatronTier, computePatronTier } from "@/lib/donation-validation";

export type DonationTransactionStatus = "pending" | "verified" | "rejected";

export interface IDonationTransaction extends Document {
  uuid: string;
  userId?: string | null;
  userUuid?: string | null;
  username?: string | null;
  donorName: string;
  donorEmail?: string | null;
  isAnonymous: boolean;
  utr: string;
  transactionId?: string | null;
  message?: string;
  claimedAmount?: number | null;
  amount?: number | null;
  status: DonationTransactionStatus;
  verifiedAmount: number | null;
  patronTier: PatronTier | null;
  isPublishedToPatrons: boolean;
  donorRecordId?: string | null;
  bankReference?: string | null;
  recipientVpa?: string | null;
  verificationMethod?: "manual-bank-reconciliation" | null;
  adminNote?: string;
  verifiedBy?: string | null;
  verifiedAt?: Date | null;
  submitterIp?: string;
  isPublic: boolean;
  donatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const isNullableFiniteCurrency = (v: number | null | undefined) =>
  v == null || (Number.isFinite(v) && v >= 0 && v <= 10_000_000);

const isNullableVerifiedCurrency = (v: number | null | undefined) =>
  v == null || (Number.isFinite(v) && v >= 1 && v <= 10_000_000);

const DonationTransactionSchema = new Schema<IDonationTransaction>({
  uuid: { type: String, required: true, unique: true, default: () => randomUUID() },
  // Both IDs remain strings: ConceptNichod uses UUID strings, not Mongo ObjectIds.
  userId: { type: String, default: null, index: true },
  userUuid: { type: String, default: null, index: true },
  username: { type: String, trim: true, default: null },
  donorName: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
  donorEmail: { type: String, trim: true, lowercase: true, default: null },
  isAnonymous: { type: Boolean, default: false },
  utr: { type: String, required: true, unique: true, trim: true, match: [/^\d{12}$/, "UTR must be an exact 12-digit number"] },
  // Sparse unique index allows legacy rows without a Transaction ID.
  transactionId: { type: String, required: function (this: any) { return this.isNew; }, unique: true, sparse: true, trim: true, uppercase: true, minlength: 6, maxlength: 45, match: /^[A-Z0-9_-]{6,45}$/ },
  message: { type: String, trim: true, maxlength: 250, default: "" },
  claimedAmount: { type: Number, default: null, min: 0, validate: { validator: isNullableFiniteCurrency, message: "Claimed amount must be a finite valid number" } },
  amount: { type: Number, default: null, min: 0, validate: { validator: isNullableFiniteCurrency, message: "Amount must be a finite valid number" } },
  status: { type: String, enum: ["pending", "verified", "rejected"], default: "pending", index: true },
  verifiedAmount: { type: Number, default: null, min: 1, validate: { validator: isNullableVerifiedCurrency, message: "Verified amount must be a finite valid number" } },
  patronTier: { type: String, enum: ["LEGEND", "DIAMOND", "GOLD", "SILVER", "SUPPORTER", "Legend", "Benefactor", "Patron", "Supporter", null], default: null },
  isPublishedToPatrons: { type: Boolean, default: false, index: true },
  donorRecordId: { type: String, default: null },
  bankReference: { type: String, trim: true, default: null },
  recipientVpa: { type: String, trim: true, lowercase: true, default: null },
  verificationMethod: { type: String, enum: ["manual-bank-reconciliation", null], default: null },
  adminNote: { type: String, trim: true, maxlength: 500, default: "" },
  verifiedBy: { type: String, default: null },
  verifiedAt: { type: Date, default: null },
  submitterIp: { type: String, select: false },
  // Legacy fields retained for older history queries.
  isPublic: { type: Boolean, default: false },
  donatedAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

DonationTransactionSchema.index({ status: 1, createdAt: -1 });
DonationTransactionSchema.index({ status: 1, isPublishedToPatrons: 1, verifiedAmount: -1 });
DonationTransactionSchema.index({ userId: 1, createdAt: -1 });

DonationTransactionSchema.pre("save", function (this: IDonationTransaction) {
  if (this.status !== "verified" || !this.verifiedAmount || !Number.isFinite(this.verifiedAmount) || this.verifiedAmount <= 0) {
    this.isPublishedToPatrons = false;
    this.isPublic = false;
    this.patronTier = null;
  } else {
    this.amount = this.verifiedAmount;
    this.isPublic = Boolean(this.isPublishedToPatrons);
    if (!this.patronTier) this.patronTier = computePatronTier(this.verifiedAmount);
  }
});

export const DonationTransaction: Model<IDonationTransaction> =
  mongoose.models.DonationTransaction ||
  mongoose.model<IDonationTransaction>("DonationTransaction", DonationTransactionSchema);
export default DonationTransaction;
