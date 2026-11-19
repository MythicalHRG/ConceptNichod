import mongoose, { Schema, Document, Model } from "mongoose";

export interface IStudyGroup extends Document {
  name: string;
  description: string;
  subject: string;
  examFocus?: string;
  schedule?: string;
  ownerId: string;
  memberIds: string[];
  createdAt: Date;
}

const StudyGroupSchema = new Schema<IStudyGroup>({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, required: true, trim: true, maxlength: 1000 },
  subject: { type: String, required: true, trim: true, maxlength: 80 },
  examFocus: { type: String, trim: true, maxlength: 80 },
  schedule: { type: String, trim: true, maxlength: 160 },
  ownerId: { type: String, required: true, index: true },
  memberIds: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
});

StudyGroupSchema.index({ memberIds: 1 });
StudyGroupSchema.index({ subject: 1 });
StudyGroupSchema.index({ createdAt: -1 });

const StudyGroup: Model<IStudyGroup> =
  mongoose.models.StudyGroup ||
  mongoose.model<IStudyGroup>("StudyGroup", StudyGroupSchema);

export default StudyGroup;
