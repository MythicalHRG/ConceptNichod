import mongoose, { Schema, Document, Model } from "mongoose";

export type StudyMaterialKind = "formula" | "definition" | "mistake";

export interface IStudyMaterial extends Document {
  userId: string;
  kind: StudyMaterialKind;
  title: string;
  prompt: string;
  answer: string;
  reason?: string;
  topicId?: string;
  subject?: string;
  chapter?: string;
  intervalDays: number;
  repetitions: number;
  dueAt: Date;
  lastReviewedAt?: Date;
  createdAt: Date;
}

const StudyMaterialSchema = new Schema<IStudyMaterial>({
  userId: { type: String, required: true, index: true },
  kind: { type: String, enum: ["formula", "definition", "mistake"], required: true },
  title: { type: String, required: true, maxlength: 180 },
  prompt: { type: String, required: true, maxlength: 3000 },
  answer: { type: String, required: true, maxlength: 6000 },
  reason: { type: String, maxlength: 1000 },
  topicId: String,
  subject: String,
  chapter: String,
  intervalDays: { type: Number, default: 0, min: 0 },
  repetitions: { type: Number, default: 0, min: 0 },
  dueAt: { type: Date, default: Date.now },
  lastReviewedAt: Date,
  createdAt: { type: Date, default: Date.now },
});

StudyMaterialSchema.index({ userId: 1, dueAt: 1 });

const StudyMaterial: Model<IStudyMaterial> = mongoose.models.StudyMaterial || mongoose.model<IStudyMaterial>("StudyMaterial", StudyMaterialSchema);
export default StudyMaterial;
