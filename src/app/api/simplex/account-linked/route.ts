import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongoose";
import { verifySimplexWebhookSecret } from "@/lib/simplex-bridge";
import User from "@/models/User";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1] || null;
  if (!verifySimplexWebhookSecret(token)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await request.text();
  if (raw.length > 2048) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  let payload: { userId?: unknown; linked?: unknown };
  try { payload = JSON.parse(raw); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (typeof payload.userId !== "string" || typeof payload.linked !== "boolean") return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  await dbConnect();
  const result = await User.updateOne({ uuid: payload.userId }, { $set: { simplexLinked: payload.linked } });
  if (!result.matchedCount) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
