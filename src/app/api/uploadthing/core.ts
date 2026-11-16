import { createUploadthing, type FileRouter } from "uploadthing/next";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import { verifySessionCookie } from "@/lib/session";
import { isPlatformOwner } from "@/lib/owner-access";

const f = createUploadthing();

export const ourFileRouter = {
  broadcastAttachment: f({ blob: { maxFileSize: "512MB" } })
    .middleware(async ({ req }) => {
      await dbConnect();
      const rawSession = (await cookies()).get("user_session")?.value;
      const sessionUuid = verifySessionCookie(rawSession);
      if (!sessionUuid) throw new Error("Unauthorized");

      const user = await User.findOne({ uuid: sessionUuid }).lean();
      if (!isPlatformOwner(user)) {
        throw new Error("Unauthorized");
      }
      return { userId: user.uuid };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("Upload complete for Admin:", metadata.userId);
      console.log("file url", file.url);
      return { uploadedBy: metadata.userId, fileUrl: file.url };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
