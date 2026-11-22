import fs from "node:fs";
import mongoose from "mongoose";

const OWNER_USERNAME = "mythicalhrg";
const OWNER_EMAIL = "mythicalhrg@gmail.com";
const REQUIRED_CONFIRMATION = "PROMOTE_MYTHICALHRG_OWNER";

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

async function bootstrapOwner() {
  if (process.env.OWNER_BOOTSTRAP_CONFIRM !== REQUIRED_CONFIRMATION) throw new Error("Refusing to run: set OWNER_BOOTSTRAP_CONFIRM to the documented confirmation value.");
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required. Load it from the trusted production environment; never paste it into source control.");
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000, maxPoolSize: 1 });
  try {
    const User = mongoose.models.User || mongoose.model("User", new mongoose.Schema({ username: String, email: String, role: String }, { collection: "users", strict: false }));
    const candidates = await User.find({ $or: [
      { username: { $regex: "^mythicalhrg$", $options: "i" } },
      { email: { $regex: "^mythicalhrg@gmail\\.com$", $options: "i" } },
    ] }).select("_id username email role").lean();
    if (candidates.length !== 1) throw new Error(`Expected exactly one account matching the reserved owner identity; found ${candidates.length}. No changes made.`);
    const account = candidates[0];
    const username = typeof account.username === "string" ? account.username.trim().toLowerCase() : "";
    const email = typeof account.email === "string" ? account.email.trim().toLowerCase() : "";
    if (username !== OWNER_USERNAME || email !== OWNER_EMAIL) throw new Error("The matching record does not contain both exact reserved identity fields. No changes made.");
    if (account.role === "owner") { console.log("Owner provisioning verified: the designated account already has role=owner. No change needed."); return; }
    if (account.role !== "user") throw new Error(`Refusing to change unexpected role "${String(account.role)}". No changes made.`);
    const result = await User.updateOne({ _id: account._id, username: account.username, email: account.email, role: "user" }, { $set: { role: "owner" } });
    if (result.modifiedCount !== 1) {
      const latest = await User.findById(account._id).select("role").lean();
      if (latest?.role !== "owner") throw new Error("The account changed during provisioning; owner role was not confirmed.");
    }
    const verified = await User.findById(account._id).select("username email role").lean();
    if (verified?.role !== "owner" || String(verified.username || "").trim().toLowerCase() !== OWNER_USERNAME || String(verified.email || "").trim().toLowerCase() !== OWNER_EMAIL) throw new Error("Post-update verification failed. Check the database before retrying.");
    console.log("Owner provisioning successful: the exact reserved account is verified with role=owner.");
  } finally { await mongoose.disconnect(); }
}

bootstrapOwner().catch(async (error) => {
  console.error("Owner provisioning failed:", error?.message || "Unknown error");
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
