import mongoose, { Schema, Document, Model } from "mongoose";

export type StudyAttemptKind = "review" | "mock-test" | "answer-coach" | "teach-back" | "topic-practice" | "concept-mirror";

export interface IStudyAttempt extends Document {
  userId: string;
  kind: StudyAttemptKind;
  title: string;
  topicId?: string;
  subject?: string;
  chapter?: string;
  score: number;
  confidence?: number;
  weakAreas: string[];
  details?: unknown;
  createdAt: Date;
}

const StudyAttemptSchema = new Schema<IStudyAttempt>({
  userId: { type: String, required: true, index: true },
  kind: { type: String, enum: ["review", "mock-test", "answer-coach", "teach-back", "topic-practice", "concept-mirror"], required: true },
  title: { type: String, required: true, maxlength: 180 },
  topicId: String,
  subject: String,
  chapter: String,
  score: { type: Number, required: true, min: 0, max: 100 },
  confidence: { type: Number, min: 1, max: 5 },
  weakAreas: { type: [String], default: [] },
  details: Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now, index: true },
});

StudyAttemptSchema.index({ userId: 1, createdAt: -1 });

const StudyAttempt: Model<IStudyAttempt> = mongoose.models.StudyAttempt || mongoose.model<IStudyAttempt>("StudyAttempt", StudyAttemptSchema);
export default StudyAttempt;
