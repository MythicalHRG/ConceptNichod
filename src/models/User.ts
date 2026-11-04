import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUser extends Document {
  uuid: string;
  username: string;
  email: string;
  password: string; // encrypted
  fullName: string;
  gender: string;
  dob: string;
  classLevel: string;
  examFocus?: string;
  city: string;
  futureCollege?: string;
  snapchat?: string;
  instagram?: string;
  bio?: string;
  role: "user" | "admin";
  lastKnownIp?: string;
  createdAt: Date;
}

const UserSchema: Schema<IUser> = new Schema({
  uuid: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  fullName: { type: String, required: true },
  gender: { type: String, required: true },
  dob: { type: String, required: true },
  classLevel: { type: String, required: true },
  examFocus: { type: String, required: false },
  city: { type: String, required: true },
  futureCollege: { type: String, required: false },
  snapchat: { type: String, required: false },
  instagram: { type: String, required: false },
  bio: { type: String, required: false },
  role: { type: String, enum: ["user", "admin"], default: "user" },
  lastKnownIp: { type: String, required: false },
  createdAt: { type: Date, default: Date.now }
});

const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);

export default User;
