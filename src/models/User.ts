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
  isDiscoverable: boolean;
  shareProgress: boolean;
  shareSocialLinks: boolean;
  shareLocation: boolean;
  allowIncomingMessages: boolean;
  simplexLinked: boolean;
  role: "user" | "admin";
  firstLoginIp?: string;
  firstLoginAt?: Date;
  lastLoginIp?: string;
  lastLoginAt?: Date;
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
  isDiscoverable: { type: Boolean, default: false },
  shareProgress: { type: Boolean, default: false },
  shareSocialLinks: { type: Boolean, default: false },
  shareLocation: { type: Boolean, default: false },
  allowIncomingMessages: { type: Boolean, default: true },
  simplexLinked: { type: Boolean, default: false },
  role: { type: String, enum: ["user", "admin"], default: "user" },
  firstLoginIp: { type: String, required: false },
  firstLoginAt: { type: Date, required: false },
  lastLoginIp: { type: String, required: false },
  lastLoginAt: { type: Date, required: false },
  lastKnownIp: { type: String, required: false },
  createdAt: { type: Date, default: Date.now }
});

UserSchema.pre(["find", "findOne", "findOneAndUpdate", "deleteOne", "deleteMany"], function (this: any) {
  const query = this.getQuery();
  if (query && typeof query.uuid === "string" && query.uuid.includes(".")) {
    query.uuid = query.uuid.split(".")[0];
  }
});

const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);

export default User;
