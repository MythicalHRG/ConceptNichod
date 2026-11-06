import mongoose, { Schema, Document, Model } from "mongoose";

export interface IConceptRelation extends Document {
  userId: string;
  fromTopicId: string;
  toTopicId: string;
  relation: "prerequisite" | "related";
  createdAt: Date;
}

const ConceptRelationSchema = new Schema<IConceptRelation>({
  userId: { type: String, required: true, index: true },
  fromTopicId: { type: String, required: true },
  toTopicId: { type: String, required: true },
  relation: { type: String, enum: ["prerequisite", "related"], default: "prerequisite" },
  createdAt: { type: Date, default: Date.now },
});
ConceptRelationSchema.index({ userId: 1, fromTopicId: 1, toTopicId: 1 }, { unique: true });

const ConceptRelation: Model<IConceptRelation> = mongoose.models.ConceptRelation || mongoose.model<IConceptRelation>("ConceptRelation", ConceptRelationSchema);
export default ConceptRelation;
