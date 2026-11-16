export const PLATFORM_OWNER_USERNAME = "mythicalhrg";
export const PLATFORM_OWNER_EMAIL = "mythicalhrg@gmail.com";

export interface PlatformOwnerIdentity {
  username?: unknown;
  email?: unknown;
  role?: unknown;
}

export function hasPlatformOwnerIdentity(
  user: PlatformOwnerIdentity | null | undefined
): boolean {
  if (!user) return false;
  const username = typeof user.username === "string" ? user.username.trim().toLowerCase() : "";
  const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  return username === PLATFORM_OWNER_USERNAME || email === PLATFORM_OWNER_EMAIL;
}

export function isPlatformOwner(
  user: PlatformOwnerIdentity | null | undefined
): user is PlatformOwnerIdentity & { username: string; role: "owner" } {
  return Boolean(user && user.role === "owner" && hasPlatformOwnerIdentity(user));
}
