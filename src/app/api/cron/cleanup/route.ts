import dbConnect from "@/lib/mongoose";
import Broadcast from "@/models/Broadcast";
import { UTApi } from "uploadthing/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    await dbConnect();

    // Find all expired broadcasts
    const expiredBroadcasts = await Broadcast.find({ expiresAt: { $lt: new Date() } });
    if (expiredBroadcasts.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No expired broadcasts found" }), { status: 200 });
    }

    const utapi = new UTApi();
    const fileKeysToDelete: string[] = [];

    // Collect file keys from URLs
    for (const broadcast of expiredBroadcasts) {
      if (broadcast.fileUrl) {
        // fileUrl is like https://utfs.io/f/xyz123
        const parts = broadcast.fileUrl.split("/f/");
        if (parts.length === 2 && parts[1]) {
          fileKeysToDelete.push(parts[1]);
        }
      }
    }

    // Delete from UploadThing
    if (fileKeysToDelete.length > 0) {
      await utapi.deleteFiles(fileKeysToDelete);
    }

    // Delete from MongoDB
    const idsToDelete = expiredBroadcasts.map(b => b._id);
    await Broadcast.deleteMany({ _id: { $in: idsToDelete } });

    return new Response(JSON.stringify({ 
      success: true, 
      deletedCount: idsToDelete.length, 
      filesDeleted: fileKeysToDelete.length 
    }), { status: 200 });
  } catch (error: any) {
    console.error("Cron Job Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
  }
}
