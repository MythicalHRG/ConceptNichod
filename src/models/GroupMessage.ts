import mongoose, { Schema, Document, Model } from "mongoose";

export interface IGroupMessage extends Document {
  groupId: string;
  senderId: string;
  senderUsername: string;
  body: string;
  createdAt: Date;
}

const GroupMessageSchema = new Schema<IGroupMessage>({
  groupId: { type: String, required: true, index: true },
  senderId: { type: String, required: true },
  senderUsername: { type: String, required: true },
  body: { type: String, required: true, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now },
});

GroupMessageSchema.index({ groupId: 1, createdAt: 1 });

const GroupMessage: Model<IGroupMessage> =
  mongoose.models.GroupMessage ||
  mongoose.model<IGroupMessage>("GroupMessage", GroupMessageSchema);

export default GroupMessage;
