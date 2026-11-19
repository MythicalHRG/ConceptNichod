import mongoose, { Schema, Document, Model } from "mongoose";

export interface IStudyStreak extends Document {
  userId: string;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string; // YYYY-MM-DD in IST (Asia/Kolkata)
  activityDates: string[]; // List of YYYY-MM-DD in IST
  updatedAt: Date;
}

const isNonNegativeSafeInt = (v: number) => Number.isSafeInteger(v) && v >= 0;

const StudyStreakSchema = new Schema<IStudyStreak>({
  userId: { type: String, required: true, unique: true },
  currentStreak: { type: Number, default: 0, min: 0, validate: { validator: isNonNegativeSafeInt, message: "Current streak must be a non-negative integer" } },
  longestStreak: { type: Number, default: 0, min: 0, validate: { validator: isNonNegativeSafeInt, message: "Longest streak must be a non-negative integer" } },
  lastActiveDate: { type: String, default: "" },
  activityDates: { type: [String], default: [] },
  updatedAt: { type: Date, default: Date.now },
});

const StudyStreak: Model<IStudyStreak> =
  mongoose.models.StudyStreak ||
  mongoose.model<IStudyStreak>("StudyStreak", StudyStreakSchema);

export default StudyStreak;
