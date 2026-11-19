import mongoose, { Schema, Document, Model } from "mongoose";

export interface IMistakeEntry extends Document {
  userId: string;
  title: string;
  subject: string;
  chapter?: string;
  errorType: "conceptual" | "calculation" | "formula" | "misread";
  questionOrPrompt?: string;
  myMistake: string;
  correctConcept: string;
  status: "unresolved" | "mastered";
  source?: "concept_mirror" | "nichod" | "manual";
  reviewCount: number;
  lastReviewedAt?: Date;
  createdAt: Date;
}

const MistakeEntrySchema = new Schema<IMistakeEntry>({
  userId: { type: String, required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  subject: { type: String, required: true, trim: true, maxlength: 60 },
  chapter: { type: String, trim: true, maxlength: 80 },
  errorType: {
    type: String,
    enum: ["conceptual", "calculation", "formula", "misread"],
    default: "conceptual",
  },
  questionOrPrompt: { type: String, trim: true, maxlength: 3000 },
  myMistake: { type: String, required: true, trim: true, maxlength: 2500 },
  correctConcept: { type: String, required: true, trim: true, maxlength: 2500 },
  status: {
    type: String,
    enum: ["unresolved", "mastered"],
    default: "unresolved",
    index: true,
  },
  source: {
    type: String,
    enum: ["concept_mirror", "nichod", "manual"],
    default: "manual",
  },
  reviewCount: {
    type: Number,
    default: 0,
    min: 0,
    validate: { validator: (v: number) => Number.isSafeInteger(v) && v >= 0, message: "Review count must be a non-negative integer" },
  },
  lastReviewedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

MistakeEntrySchema.index({ userId: 1, status: 1 });
MistakeEntrySchema.index({ userId: 1, subject: 1 });
MistakeEntrySchema.index({ userId: 1, createdAt: -1 });

const MistakeEntry: Model<IMistakeEntry> =
  mongoose.models.MistakeEntry ||
  mongoose.model<IMistakeEntry>("MistakeEntry", MistakeEntrySchema);

export default MistakeEntry;
