import mongoose, { Schema, Document, Model } from "mongoose";

export interface INotificationRead extends Document {
  userId: string; // The uuid of the User
  lastReadAt: Date; // The last time this user opened the notification bell
}

const NotificationReadSchema: Schema<INotificationRead> = new Schema({
  userId: { type: String, required: true, unique: true },
  lastReadAt: { type: Date, default: Date.now }
});

const NotificationRead: Model<INotificationRead> = mongoose.models.NotificationRead || mongoose.model<INotificationRead>("NotificationRead", NotificationReadSchema);

export default NotificationRead;
