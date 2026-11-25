import mongoose, { Schema, Document, Model } from "mongoose";

export interface ITopic extends Document {
  userId: string;
  name: string;
  classLevel: string;
  subject: string;
  chapter: string;
  examFocus?: string;
  summary?: string;
  questions?: { type: string; question: string }[];
  analysis?: any;
  summaryViewed?: boolean;
  practiceStatus?: 'not_started' | 'in_progress' | 'completed';
  savedWrittenAnswers?: string[];
  savedSpokenAnswers?: string[];
  savedFinalSummarySpeech?: string;
  createdAt: Date;
}

const TopicSchema: Schema<ITopic> = new Schema({
  userId: { type: String, required: true },
  name: { type: String, required: true },
  classLevel: { type: String, required: true },
  subject: { type: String, required: true },
  chapter: { type: String, required: true },
  examFocus: { type: String, required: false },
  summary: { type: String, required: false },
  questions: { type: [Schema.Types.Mixed], required: false },
  analysis: { type: Schema.Types.Mixed, required: false },
  summaryViewed: { type: Boolean, default: false },
  practiceStatus: { type: String, enum: ['not_started', 'in_progress', 'completed'], default: 'not_started' },
  savedWrittenAnswers: { type: [String], default: [] },
  savedSpokenAnswers: { type: [String], default: [] },
  savedFinalSummarySpeech: { type: String, default: "", maxlength: 5000 },
  createdAt: { type: Date, default: Date.now }
});

// Indexes for high-speed dashboard, profile, and leaderboard aggregation
TopicSchema.index({ userId: 1, createdAt: -1 });
TopicSchema.index({ userId: 1, practiceStatus: 1 });

// Use existing model or compile new one
const Topic: Model<ITopic> = mongoose.models.Topic || mongoose.model<ITopic>("Topic", TopicSchema);

export default Topic;
