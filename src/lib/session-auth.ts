import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import { getSessionVersionFromCookie, verifySessionCookie } from "@/lib/session";

/**
 * Verify the cookie cryptographically and against the account's current
 * sessionVersion. This is the server-side revocation check used by every
 * private page, route handler, and server action.
 */
export async function getVerifiedSessionUuid(rawCookie?: string | null): Promise<string | null> {
  const cookieValue = rawCookie === undefined
    ? (await cookies()).get("user_session")?.value
    : rawCookie;
  const uuid = verifySessionCookie(cookieValue);
  if (!uuid) return null;

  await dbConnect();
  const user = await User.findOne({ uuid }).select("sessionVersion").lean();
  if (!user) return null;

  const tokenVersion = getSessionVersionFromCookie(cookieValue);
  // Unsigned development-only UUIDs are supported only by the existing local
  // development compatibility path and always represent version zero.
  const effectiveTokenVersion = tokenVersion ?? 0;
  const currentVersion = Number.isSafeInteger(user.sessionVersion) && user.sessionVersion >= 0
    ? user.sessionVersion
    : 0;
  return effectiveTokenVersion === currentVersion ? uuid : null;
}
