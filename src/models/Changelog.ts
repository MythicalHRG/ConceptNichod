import mongoose, { Schema, Document, Model } from "mongoose";
import { PLATFORM_OWNER_USERNAME } from "@/lib/owner-access";

export interface IChangelog extends Document {
  version: string;
  title: string;
  category: "Major Update" | "Feature" | "Improvement" | "Bug Fix" | "Security";
  content: string; // Markdown or bullet points
  createdBy: string;
  releaseDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ChangelogSchema: Schema<IChangelog> = new Schema(
  {
    version: { type: String, required: true, trim: true, maxlength: 50 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    category: {
      type: String,
      enum: ["Major Update", "Feature", "Improvement", "Bug Fix", "Security"],
      default: "Feature",
    },
    content: { type: String, required: true, trim: true, maxlength: 20000 },
    createdBy: { type: String, trim: true, default: PLATFORM_OWNER_USERNAME },
    releaseDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

ChangelogSchema.index({ releaseDate: -1, createdAt: -1 });

const Changelog: Model<IChangelog> =
  mongoose.models.Changelog || mongoose.model<IChangelog>("Changelog", ChangelogSchema);

export default Changelog;
