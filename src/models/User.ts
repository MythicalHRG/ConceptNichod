import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUser extends Document {
  uuid: string;
  username: string;
  email: string;
  password: string;
  role: "user" | "owner";
  sessionVersion: number;
  bio?: string;
  fullName: string;
  gender: string;
  dob: string;
  classLevel: string;
  examFocus?: string;
  city: string;
  futureCollege?: string;
  snapchat?: string;
  instagram?: string;
  firstLoginIp?: string;
  firstLoginAt?: Date;
  lastLoginIp?: string;
  lastLoginAt?: Date;
  lastKnownIp?: string;
  createdAt: Date;
}

const UserSchema: Schema<IUser> = new Schema({
  uuid: { type: String, required: true, unique: true, index: true, trim: true },
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ["user", "owner"], default: "user" },
  sessionVersion: { type: Number, default: 0, min: 0 },
  bio: { type: String, default: "", trim: true, maxlength: 500 },
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  gender: { type: String, required: true, trim: true, maxlength: 40 },
  dob: { type: String, required: true, trim: true, maxlength: 40 },
  classLevel: { type: String, required: true, trim: true, maxlength: 60 },
  examFocus: { type: String, required: false, trim: true, maxlength: 100 },
  city: { type: String, required: true, trim: true, maxlength: 100 },
  futureCollege: { type: String, required: false, trim: true, maxlength: 160 },
  snapchat: { type: String, required: false, trim: true, maxlength: 80 },
  instagram: { type: String, required: false, trim: true, maxlength: 80 },
  firstLoginIp: { type: String, required: false },
  firstLoginAt: { type: Date, required: false },
  lastLoginIp: { type: String, required: false },
  lastLoginAt: { type: Date, required: false },
  lastKnownIp: { type: String, required: false },
  createdAt: { type: Date, default: Date.now },
});

// Defensive hook: retained temporarily until Batch 5 verifies every User.find* caller
UserSchema.pre(["find", "findOne", "findOneAndUpdate", "deleteOne", "deleteMany"], function (this: any) {
  const query = this.getQuery();
  if (query && typeof query.uuid === "string" && query.uuid.includes(".")) {
    query.uuid = query.uuid.split(".")[0];
  }
});

const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);

export default User;
