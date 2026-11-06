import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAccountabilityProfile extends Document {
  userId: string;
  enabled: boolean;
  weeklyGoal: string;
  schedule: string;
  createdAt: Date;
}

const AccountabilityProfileSchema = new Schema<IAccountabilityProfile>({
  userId: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: false },
  weeklyGoal: { type: String, required: true, maxlength: 240 },
  schedule: { type: String, required: true, maxlength: 160 },
  createdAt: { type: Date, default: Date.now },
});

const AccountabilityProfile: Model<IAccountabilityProfile> = mongoose.models.AccountabilityProfile || mongoose.model<IAccountabilityProfile>("AccountabilityProfile", AccountabilityProfileSchema);
export default AccountabilityProfile;
