import mongoose, { Schema, Document, Model } from "mongoose";

export type CommunityPostKind = "question" | "answer" | "resource" | "session";

export interface ICommunityPost extends Document {
  kind: CommunityPostKind;
  title: string;
  body: string;
  authorId: string;
  groupId?: string;
  parentId?: string;
  url?: string;
  topicIds: string[];
  topicLabels: string[];
  quizQuestions: string[];
  startsAt?: Date;
  durationMinutes?: number;
  helpfulBy: string[];
  createdAt: Date;
}

const CommunityPostSchema = new Schema<ICommunityPost>({
  kind: { type: String, enum: ["question", "answer", "resource", "session"], required: true },
  title: { type: String, required: true, maxlength: 180 },
  body: { type: String, required: true, maxlength: 5000 },
  authorId: { type: String, required: true, index: true },
  groupId: { type: String, index: true },
  parentId: String,
  url: { type: String, maxlength: 2000 },
  topicIds: { type: [String], default: [] },
  topicLabels: { type: [String], default: [] },
  quizQuestions: { type: [String], default: [] },
  startsAt: Date,
  durationMinutes: { type: Number, min: 1, max: 360 },
  helpfulBy: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now, index: true },
});

const CommunityPost: Model<ICommunityPost> = mongoose.models.CommunityPost || mongoose.model<ICommunityPost>("CommunityPost", CommunityPostSchema);
export default CommunityPost;
