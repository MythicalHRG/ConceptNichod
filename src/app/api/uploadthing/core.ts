import { createUploadthing, type FileRouter } from "uploadthing/next";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";

const f = createUploadthing();

const ADMIN_USERNAME = "mythicalhrg";

export const ourFileRouter = {
  broadcastAttachment: f({ blob: { maxFileSize: "512MB" } })
    .middleware(async ({ req }) => {
      await dbConnect();
      const sessionUuid = cookies().get("user_session")?.value;
      if (!sessionUuid) throw new Error("Unauthorized");

      const user = await User.findOne({ uuid: sessionUuid }).lean();
      if (!user || user.username !== ADMIN_USERNAME) {
        throw new Error("Unauthorized");
      }
      return { userId: user.uuid };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("Upload complete for admin:", metadata.userId);
      console.log("file url", file.url);
      return { uploadedBy: metadata.userId, fileUrl: file.url };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
