import mongoose from "mongoose";
import fs from "fs";
import { UTApi } from "uploadthing/server";

// Simple .env parser for standalone script
function loadEnv(file) {
  if (fs.existsSync(file)) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv(".env.local");
loadEnv(".env");

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.log("No MONGODB_URI found in environment.");
  process.exit(1);
}

function extractSafeUploadThingKey(rawUrl) {
  try {
    const fileUrl = new URL(rawUrl);
    const allowedHosts = ["utfs.io", "uploadthing.com", "ufs.sh"];
    const isAllowedHost = allowedHosts.some(
      (host) => fileUrl.hostname === host || fileUrl.hostname.endsWith("." + host)
    );
    if (fileUrl.protocol === "https:" && isAllowedHost && fileUrl.pathname.startsWith("/f/")) {
      const candidateKey = fileUrl.pathname.slice(3);
      if (
        candidateKey &&
        candidateKey !== "." &&
        candidateKey !== ".." &&
        /^[A-Za-z0-9._-]+$/.test(candidateKey)
      ) {
        return candidateKey;
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function runCleanup() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("Connected successfully.");

  try {
    const now = new Date();

    // 1. Clean up expired OTPs only (preserve active in-flight verified OTPs before expiry)
    const OtpVerification =
      mongoose.models.OtpVerification ||
      mongoose.model("OtpVerification", new mongoose.Schema({}, { strict: false }));
    const expiredOtps = await OtpVerification.deleteMany({
      expiresAt: { $lt: now },
    });
    console.log(`[CLEANUP] Deleted ${expiredOtps.deletedCount} expired OTP verification records.`);

    // 2. Clean up expired Broadcasts (delete UploadThing attachments BEFORE DB rows)
    const Broadcast =
      mongoose.models.Broadcast ||
      mongoose.model("Broadcast", new mongoose.Schema({}, { strict: false }));
    const expiredCandidates = await Broadcast.find({ expiresAt: { $lt: now } })
      .select("_id fileUrl")
      .sort({ expiresAt: 1 })
      .limit(500)
      .lean();

    let deletedBroadcasts = 0;
    let deletedFiles = 0;
    let skippedBroadcasts = 0;
    let utapi = null;

    for (const candidate of expiredCandidates) {
      if (candidate.fileUrl) {
        const fileKey = extractSafeUploadThingKey(candidate.fileUrl);
        if (!fileKey) {
          console.error("[CLEANUP] Skipping expired broadcast with unsafe/unresolvable fileUrl:", String(candidate._id));
          skippedBroadcasts += 1;
          continue;
        }
        try {
          if (!utapi) utapi = new UTApi();
          const res = await utapi.deleteFiles([fileKey]);
          if (!res?.success) {
            console.error("[CLEANUP] Failed to delete UploadThing file; retaining DB row:", String(candidate._id));
            skippedBroadcasts += 1;
            continue;
          }
          deletedFiles += 1;
        } catch (err) {
          console.error("[CLEANUP] UploadThing delete threw; retaining DB row:", String(candidate._id), err);
          skippedBroadcasts += 1;
          continue;
        }
      }

      const deleted = await Broadcast.findOneAndDelete({
        _id: candidate._id,
        expiresAt: { $lt: now },
      })
        .select("_id")
        .lean();
      if (deleted) deletedBroadcasts += 1;
    }

    console.log(
      `[CLEANUP] Deleted ${deletedBroadcasts} expired broadcasts, ${deletedFiles} attachments (${skippedBroadcasts} retained for retry).`
    );
    console.log("Database cleanup completed successfully.");
  } finally {
    await mongoose.disconnect();
  }
}

runCleanup().catch((err) => {
  console.error("Cleanup error:", err);
  process.exit(1);
});
