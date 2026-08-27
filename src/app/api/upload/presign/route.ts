import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import { s3Client } from "@/lib/s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ADMIN_USERNAME = "mythicalhrg";

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const sessionUuid = cookies().get("user_session")?.value;
    if (!sessionUuid) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const user = await User.findOne({ uuid: sessionUuid }).lean();
    if (!user || user.username !== ADMIN_USERNAME) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { filename, contentType } = await req.json();
    if (!filename || !contentType) {
      return NextResponse.json({ error: "Missing filename or contentType" }, { status: 400 });
    }

    const bucketName = process.env.R2_BUCKET_NAME;
    if (!bucketName) {
      return NextResponse.json({ error: "R2_BUCKET_NAME not configured" }, { status: 500 });
    }

    const fileKey = `broadcasts/${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
      ContentType: contentType,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    
    // R2 Public URL base, usually configured in Cloudflare R2 dashboard
    const publicUrlBase = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || `https://pub-${process.env.R2_ACCOUNT_ID}.r2.dev`;
    const publicUrl = `${publicUrlBase}/${fileKey}`;

    return NextResponse.json({ presignedUrl, publicUrl });
  } catch (error: any) {
    console.error("Presign error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
