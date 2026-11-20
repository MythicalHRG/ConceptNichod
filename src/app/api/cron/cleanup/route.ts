import dbConnect from "@/lib/mongoose";
import Broadcast from "@/models/Broadcast";
import { UTApi } from "uploadthing/server";
import { createHash, timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

const JSON_HEADERS = { "Content-Type": "application/json" };
const MAX_CLEANUP_PAGES = 5;

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const cronSecret = process.env.CRON_SECRET?.trim();
    const suppliedToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
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

    // MongoDB TTL must not delete broadcast rows before UploadThing cleanup.
    let existingIndexes: any[] = [];
    try {
      existingIndexes = await Broadcast.collection.indexes();
    } catch (indexErr: any) {
      if (indexErr?.code !== 26 && indexErr?.codeName !== "NamespaceNotFound") {
        throw indexErr;
      }
    }
    const expiryIndex = existingIndexes.find((index: any) => index.key?.expiresAt === 1);
    if (expiryIndex && expiryIndex.expireAfterSeconds !== undefined) {
      if (!expiryIndex.name) throw new Error("Broadcast expiry index name could not be resolved.");
      await Broadcast.collection.dropIndex(expiryIndex.name);
      await Broadcast.collection.createIndex({ expiresAt: 1 });
    } else if (!expiryIndex) {
      await Broadcast.collection.createIndex({ expiresAt: 1 });
    }

    const cleanupCutoff = new Date();
    let deletedCount = 0;
    let filesDeleted = 0;
    let foundAnyCandidates = false;
    const skippedIds: unknown[] = [];
    const utapi = new UTApi();

    for (let page = 0; page < MAX_CLEANUP_PAGES; page++) {
      const query: Record<string, unknown> = { expiresAt: { $lt: cleanupCutoff } };
      if (skippedIds.length > 0) {
        query._id = { $nin: skippedIds };
      }

      const candidates = await Broadcast.find(query)
        .select("_id fileUrl").sort({ expiresAt: 1 }).limit(100).lean();
      if (candidates.length === 0) break;
      foundAnyCandidates = true;

      for (const candidate of candidates) {
        const broadcast = await Broadcast.findOne({ _id: candidate._id, expiresAt: { $lt: cleanupCutoff } })
          .select("_id fileUrl").lean();
        if (!broadcast) continue;

        if (broadcast.fileUrl) {
          let fileKey: string | null = null;
          try {
            const fileUrl = new URL(broadcast.fileUrl);
            const allowedHosts = ["utfs.io", "uploadthing.com", "ufs.sh"];
            const isAllowedHost = allowedHosts.some((host) => fileUrl.hostname === host || fileUrl.hostname.endsWith("." + host));
            if (fileUrl.protocol === "https:" && isAllowedHost && fileUrl.pathname.startsWith("/f/")) {
              const candidateKey = fileUrl.pathname.slice(3);
              if (
                candidateKey &&
                candidateKey !== "." &&
                candidateKey !== ".." &&
                /^[A-Za-z0-9._-]+$/.test(candidateKey)
              ) {
                fileKey = candidateKey;
              }
            }
          } catch {
            console.warn("Skipping malformed UploadThing file URL for expired broadcast", String(broadcast._id));
          }
          if (!fileKey) {
            console.error("Skipping broadcast DB cleanup because its attachment URL could not be safely resolved.", String(broadcast._id));
            skippedIds.push(broadcast._id);
            continue;
          }
          try {
            const result = await utapi.deleteFiles([fileKey]);
            if (!result?.success) {
              console.error("UploadThing attachment deletion failed; broadcast record retained for retry.", String(broadcast._id));
              skippedIds.push(broadcast._id);
              continue;
            }
            filesDeleted += 1;
          } catch (error) {
            console.error("UploadThing attachment deletion threw; broadcast record retained for retry.", String(broadcast._id), error);
            skippedIds.push(broadcast._id);
            continue;
          }
        }

        // Remote attachment deletion completes before MongoDB removes the row.
        const deleted = await Broadcast.findOneAndDelete({ _id: broadcast._id, expiresAt: { $lt: cleanupCutoff } })
          .select("_id").lean();
        if (deleted) deletedCount += 1;
      }

      if (candidates.length < 100) break;
    }

    if (!foundAnyCandidates) {
      return jsonResponse({ success: true, message: "No expired broadcasts found" }, 200);
    }

    return jsonResponse({
      success: true,
      deletedCount,
      filesDeleted,
      skippedCount: skippedIds.length,
    }, 200);
  } catch (error: any) {
    console.error("Cron Job Error:", error);
    return jsonResponse({ success: false, error: "Internal cleanup error" }, 500);
  }
}
