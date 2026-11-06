import mongoose, { Schema, Document, Model } from "mongoose";

export interface IChatMessage extends Document {
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: Date;
  expiresAt: Date;
  relayStatus: "app-only" | "sent" | "failed";
  bridgeMessageId?: string;
}

const ChatMessageSchema = new Schema<IChatMessage>({
  conversationId: { type: String, required: true, index: true },
  senderId: { type: String, required: true },
  body: { type: String, required: true, maxlength: 12000 },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  relayStatus: { type: String, enum: ["app-only", "sent", "failed"], default: "app-only" },
  bridgeMessageId: { type: String, maxlength: 100 },
});
ChatMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
ChatMessageSchema.index({ conversationId: 1, createdAt: 1 });
ChatMessageSchema.index({ bridgeMessageId: 1 }, { unique: true, sparse: true });

const ChatMessage: Model<IChatMessage> = mongoose.models.ChatMessage || mongoose.model<IChatMessage>("ChatMessage", ChatMessageSchema);
export default ChatMessage;
