import mongoose, { Schema, Document, Model } from "mongoose";

export interface IStudyStreak extends Document {
  userId: string;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string; // YYYY-MM-DD in UTC server time
  activityDates: string[]; // List of YYYY-MM-DD
  updatedAt: Date;
}

const StudyStreakSchema = new Schema<IStudyStreak>({
  userId: { type: String, required: true, unique: true, index: true },
  currentStreak: { type: Number, default: 0 },
  longestStreak: { type: Number, default: 0 },
  lastActiveDate: { type: String, default: "" },
  activityDates: { type: [String], default: [] },
  updatedAt: { type: Date, default: Date.now },
});

const StudyStreak: Model<IStudyStreak> =
  mongoose.models.StudyStreak ||
  mongoose.model<IStudyStreak>("StudyStreak", StudyStreakSchema);

export default StudyStreak;
