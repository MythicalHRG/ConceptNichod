import mongoose from "mongoose";
import fs from "fs";

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

async function runCleanup() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("Connected successfully.");

  try {
    const now = new Date();

    // 1. Clean up expired OTPs only (do not delete active in-flight verified OTPs before expiry)
    const OtpVerification = mongoose.models.OtpVerification || mongoose.model("OtpVerification", new mongoose.Schema({}, { strict: false }));
    const expiredOtps = await OtpVerification.deleteMany({
      expiresAt: { $lt: now }
    });
    console.log(`[CLEANUP] Deleted ${expiredOtps.deletedCount} expired OTP verification records.`);

    // 2. Clean up expired Broadcasts
    const Broadcast = mongoose.models.Broadcast || mongoose.model("Broadcast", new mongoose.Schema({}, { strict: false }));
    const expiredBroadcasts = await Broadcast.deleteMany({ expiresAt: { $lt: now } });
    console.log(`[CLEANUP] Deleted ${expiredBroadcasts.deletedCount} expired broadcasts.`);

    // 3. Purge orphaned notification reads
    const NotificationRead = mongoose.models.NotificationRead || mongoose.model("NotificationRead", new mongoose.Schema({}, { strict: false }));
    const activeBroadcasts = await Broadcast.find({}).select("_id").lean();
    if (activeBroadcasts.length === 0) {
      const deletedReads = await NotificationRead.deleteMany({});
      console.log(`[CLEANUP] Deleted ${deletedReads.deletedCount} stale notification read markers.`);
    }

    console.log("Database cleanup completed successfully.");
  } finally {
    await mongoose.disconnect();
  }
}

runCleanup().catch(err => {
  console.error("Cleanup error:", err);
  process.exit(1);
});
