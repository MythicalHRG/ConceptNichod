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
  conceptName: { type: String, required: true },
  transcript: { type: String, required: true },
  durationSeconds: { type: Number, default: 0 },
  overallScore: { type: Number, required: true },
  feedbackSummary: { type: String },
  radarData: { type: [Schema.Types.Mixed], default: [] },
  pieData: { type: [Schema.Types.Mixed], default: [] },
  createdAt: { type: Date, default: Date.now },
});

const ConceptMirror: Model<IConceptMirror> =
  mongoose.models.ConceptMirror ||
  mongoose.model<IConceptMirror>("ConceptMirror", ConceptMirrorSchema);

export default ConceptMirror;
