import mongoose, { Schema, Document } from "mongoose";

export interface IDonor extends Document {
  uuid: string;
  username: string;
  amount: number;
  tier: "Supporter" | "Patron" | "Benefactor" | "Legend";
  message?: string;
  donatedAt: Date;
  isPublic: boolean;
  createdAt: Date;
}

const DonorSchema = new Schema<IDonor>(
  {
    uuid: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    amount: { type: Number, required: true },
    tier: { 
      type: String, 
      enum: ["Supporter", "Patron", "Benefactor", "Legend"], 
      default: "Supporter" 
    },
    message: { type: String, default: "" },
    donatedAt: { type: Date, default: Date.now },
    isPublic: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.models.Donor || mongoose.model<IDonor>("Donor", DonorSchema);
