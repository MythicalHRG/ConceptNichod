import mongoose, { Schema, Document, Model } from "mongoose";

export interface IConceptMirror extends Document {
  userId: string;
  conceptName: string;
  transcript: string;
  durationSeconds: number;
  overallScore: number;
  feedbackSummary?: string;
  radarData?: { metric: string; score: number }[];
  pieData?: { name: string; value: number }[];
  createdAt: Date;
}

const ConceptMirrorSchema: Schema<IConceptMirror> = new Schema({
  userId: { type: String, required: true, index: true },
  conceptName: { type: String, required: true, trim: true, maxlength: 200 },
  transcript: { type: String, required: true, trim: true, maxlength: 50000 },
  durationSeconds: {
    type: Number,
    default: 0,
    min: 0,
    max: 86400,
    validate: { validator: Number.isFinite, message: "Duration must be a finite number" },
  },
  overallScore: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    validate: { validator: Number.isFinite, message: "Overall score must be a finite number between 0 and 100" },
  },
  feedbackSummary: { type: String, trim: true, maxlength: 10000 },
  radarData: { type: [Schema.Types.Mixed], default: [] },
  pieData: { type: [Schema.Types.Mixed], default: [] },
  createdAt: { type: Date, default: Date.now },
});

ConceptMirrorSchema.index({ userId: 1, createdAt: -1 });

const ConceptMirror: Model<IConceptMirror> =
  mongoose.models.ConceptMirror ||
  mongoose.model<IConceptMirror>("ConceptMirror", ConceptMirrorSchema);

export default ConceptMirror;
