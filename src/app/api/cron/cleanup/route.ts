import dbConnect from "@/lib/mongoose";
import Broadcast from "@/models/Broadcast";
import { UTApi } from "uploadthing/server";
import { createHash, timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const cronSecret = process.env.CRON_SECRET;
    const suppliedToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!cronSecret || !suppliedToken) {
      return new Response("Unauthorized", { status: 401 });
    }
    // Hash both inputs to fixed-length digests before constant-time comparison.
    // This avoids timingSafeEqual throwing on unequal input lengths.
    const expectedDigest = createHash("sha256").update(cronSecret, "utf8").digest();
    const suppliedDigest = createHash("sha256").update(suppliedToken, "utf8").digest();
    if (!timingSafeEqual(expectedDigest, suppliedDigest)) {
      return new Response("Unauthorized", { status: 401 });
    }

    await dbConnect();

    // Select only a bounded batch. Each row is atomically rechecked at deletion time
    // so a broadcast renewed after the initial query is never removed as expired.
    const cleanupCutoff = new Date();
    const candidates = await Broadcast.find({ expiresAt: { $lt: cleanupCutoff } })
      .select("_id")
      .sort({ expiresAt: 1 })
      .limit(100)
      .lean();

    if (candidates.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No expired broadcasts found" }), { status: 200 });
    }

    const deletedBroadcasts = [];
    for (const candidate of candidates) {
      const deleted = await Broadcast.findOneAndDelete({
        _id: candidate._id,
        expiresAt: { $lt: cleanupCutoff },
      }).select("_id fileUrl").lean();
      if (deleted) deletedBroadcasts.push(deleted);
    }

    const fileKeysToDelete: string[] = [];
    for (const broadcast of deletedBroadcasts) {
      if (!broadcast.fileUrl) continue;
      try {
        const fileUrl = new URL(broadcast.fileUrl);
        const pathPrefix = "/f/";
        if (fileUrl.pathname.startsWith(pathPrefix)) {
          const fileKey = fileUrl.pathname.slice(pathPrefix.length);
          if (fileKey && !fileKey.includes("/")) fileKeysToDelete.push(fileKey);
        }
      } catch {
        console.warn("Skipping malformed UploadThing file URL for expired broadcast", String(broadcast._id));
      }
    }

    // Database rows are deleted only after the atomic expiry recheck above. File
    // deletion failures are reported; they must not cause an active row to be lost.
    let filesDeleted = 0;
    if (fileKeysToDelete.length > 0) {
      const utapi = new UTApi();
      const result = await utapi.deleteFiles(fileKeysToDelete);
      filesDeleted = fileKeysToDelete.length;
      if (result && result.success === false) {
        console.error("UploadThing reported unsuccessful cleanup for expired broadcast attachments.");
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      deletedCount: deletedBroadcasts.length, 
      filesDeleted: fileKeysToDelete.length 
    }), { status: 200 });
  } catch (error: any) {
    console.error("Cron Job Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
  }
}
