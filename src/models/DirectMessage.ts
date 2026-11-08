import mongoose, { Schema, Document, Model } from "mongoose";

export interface IDirectMessage extends Document {
  conversationKey: string;
  participantIds: string[];
  senderId: string;
  senderUsername: string;
  body: string;
  createdAt: Date;
}

const DirectMessageSchema = new Schema<IDirectMessage>({
  conversationKey: { type: String, required: true, index: true },
  participantIds: { type: [String], required: true },
  senderId: { type: String, required: true },
  senderUsername: { type: String, required: true },
  body: { type: String, required: true, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now },
});

DirectMessageSchema.index({ conversationKey: 1, createdAt: 1 });
DirectMessageSchema.index({ participantIds: 1 });

const DirectMessage: Model<IDirectMessage> =
  mongoose.models.DirectMessage ||
  mongoose.model<IDirectMessage>("DirectMessage", DirectMessageSchema);

export default DirectMessage;
