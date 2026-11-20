import { createUploadthing, type FileRouter } from "uploadthing/next";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import { verifySessionCookie } from "@/lib/session";
import { isPlatformOwner } from "@/lib/owner-access";
import { checkDistributedRateLimit } from "@/lib/distributed-rate-limiter";

const f = createUploadthing();

export const ourFileRouter = {
  broadcastAttachment: f({
    image: { maxFileSize: "16MB", maxFileCount: 1 },
    pdf: { maxFileSize: "16MB", maxFileCount: 1 },
    text: { maxFileSize: "2MB", maxFileCount: 1 },
  })
    .middleware(async () => {
      await dbConnect();
      const rawSession = (await cookies()).get("user_session")?.value;
      const sessionUuid = verifySessionCookie(rawSession);
      if (!sessionUuid) throw new Error("Unauthorized");

      const user = await User.findOne({ uuid: sessionUuid })
        .select("uuid username email role")
        .lean();
      if (!isPlatformOwner(user)) {
        throw new Error("Unauthorized");
      }

      const rateCheck = await checkDistributedRateLimit(`uploadthing:${sessionUuid}`, 20, 15 * 60 * 1000);
      if (!rateCheck.success) {
        throw new Error("Too many uploads. Please wait before uploading another file.");
      }

      return { userId: sessionUuid };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      const fileUrl = file.ufsUrl || file.url;
      console.log("Upload complete for Admin:", metadata.userId);
      console.log("file url", fileUrl);
      return { uploadedBy: metadata.userId, fileUrl };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
