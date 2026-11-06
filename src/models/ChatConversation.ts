import mongoose, { Schema, Document, Model } from "mongoose";

export interface IChatConversation extends Document {
  participantIds: string[];
  participantKey: string;
  mutedBy: string[];
  closedBy: string[];
  simplexConversationId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ChatConversationSchema = new Schema<IChatConversation>({
  participantIds: { type: [String], required: true, validate: (ids: string[]) => ids.length === 2 && ids[0] !== ids[1] },
  participantKey: { type: String, required: true, unique: true },
  mutedBy: { type: [String], default: [] },
  closedBy: { type: [String], default: [] },
  simplexConversationId: String,
}, { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } });
ChatConversationSchema.index({ participantIds: 1 });

const ChatConversation: Model<IChatConversation> = mongoose.models.ChatConversation || mongoose.model<IChatConversation>("ChatConversation", ChatConversationSchema);
export default ChatConversation;
