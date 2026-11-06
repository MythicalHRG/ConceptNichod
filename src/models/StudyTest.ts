import mongoose, { Document, Model, Schema } from "mongoose";

export interface IStudyTest extends Document {
  userId: string;
  title: string;
  subject: string;
  chapter?: string;
  difficulty: "easy" | "medium" | "hard";
  durationMinutes: number;
  questions: { question: string; topic: string }[];
  startedAt: Date;
  expiresAt: Date;
  completedAt?: Date;
}

const StudyTestSchema = new Schema<IStudyTest>({
  userId: { type: String, required: true, index: true },
  title: { type: String, required: true, maxlength: 180 },
  subject: { type: String, required: true, maxlength: 80 },
  chapter: { type: String, maxlength: 100 },
  difficulty: { type: String, enum: ["easy", "medium", "hard"], required: true },
  durationMinutes: { type: Number, required: true, min: 1, max: 180 },
  questions: { type: [{ question: { type: String, required: true }, topic: { type: String, required: true } }], required: true },
  startedAt: { type: Date, required: true, default: Date.now },
  expiresAt: { type: Date, required: true },
  completedAt: Date,
}, { versionKey: false });

StudyTestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const StudyTest: Model<IStudyTest> = mongoose.models.StudyTest || mongoose.model<IStudyTest>("StudyTest", StudyTestSchema);
export default StudyTest;
