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
  conversationKey: { type: String, required: true, trim: true },
  participantIds: {
    type: [String],
    required: true,
    validate: {
      validator: (ids: string[]) => Array.isArray(ids) && ids.length === 2 && ids.every((id) => typeof id === "string" && id.trim().length > 0),
      message: "Direct messages must have exactly 2 valid participant IDs",
    },
  },
  senderId: { type: String, required: true, trim: true },
  senderUsername: { type: String, required: true, trim: true },
  body: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now },
});

DirectMessageSchema.index({ conversationKey: 1, createdAt: 1 });
DirectMessageSchema.index({ participantIds: 1, createdAt: -1 });

const DirectMessage: Model<IDirectMessage> =
  mongoose.models.DirectMessage ||
  mongoose.model<IDirectMessage>("DirectMessage", DirectMessageSchema);

export default DirectMessage;
