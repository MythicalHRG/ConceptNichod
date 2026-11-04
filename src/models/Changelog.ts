import mongoose, { Schema, Document, Model } from "mongoose";

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
    version: { type: String, required: true },
    title: { type: String, required: true },
    category: {
      type: String,
      enum: ["Major Update", "Feature", "Improvement", "Bug Fix", "Security"],
      default: "Feature",
    },
    content: { type: String, required: true },
    createdBy: { type: String, default: "mythicalhrg" },
    releaseDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const Changelog: Model<IChangelog> =
  mongoose.models.Changelog || mongoose.model<IChangelog>("Changelog", ChangelogSchema);

export default Changelog;
