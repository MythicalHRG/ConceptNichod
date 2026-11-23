import User from "@/models/User";
import { normalizeEmail } from "@/lib/email-utils";

export const PLATFORM_OWNER_USERNAME = "mythicalhrg";
export const PLATFORM_OWNER_EMAIL = "mythicalhrg@gmail.com";

export interface PlatformOwnerIdentity {
  uuid?: unknown;
  username?: unknown;
  email?: unknown;
  role?: unknown;
}

export function hasPlatformOwnerIdentity(
  user: PlatformOwnerIdentity | null | undefined
): boolean {
  if (!user) return false;
  const username = typeof user.username === "string" ? user.username.trim().toLowerCase() : "";
  const email = typeof user.email === "string" ? normalizeEmail(user.email) : "";
  return username === PLATFORM_OWNER_USERNAME && email === normalizeEmail(PLATFORM_OWNER_EMAIL);
}

/**
 * Upgrade only the exact canonical owner record. The UUID, reserved username,
 * and normalized owner email are all checked before the atomic role update.
 */
export async function ensurePlatformOwnerRole<T extends PlatformOwnerIdentity>(
  user: T
): Promise<T> {
  if (!hasPlatformOwnerIdentity(user) || user.role === "owner") return user;
  if (typeof user.uuid !== "string" || !user.uuid.trim() || typeof user.email !== "string") return user;

  const result = await User.updateOne(
    { uuid: user.uuid, username: /^mythicalhrg$/i, email: user.email },
    { $set: { role: "owner" } }
  );
  if (result.matchedCount === 1) user.role = "owner";
  return user;
}

export function isPlatformOwner(
  user: PlatformOwnerIdentity | null | undefined
): user is PlatformOwnerIdentity & { username: string; role: "owner" } {
  return Boolean(user && user.role === "owner" && hasPlatformOwnerIdentity(user));
}
