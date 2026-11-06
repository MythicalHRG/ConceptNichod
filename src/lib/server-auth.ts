import { cookies } from "next/headers";
import { verifySessionCookie } from "@/lib/session";

export function requireSessionUuid() {
  const sessionUuid = verifySessionCookie(cookies().get("user_session")?.value);
  if (!sessionUuid) throw new Error("Not authenticated");
  return sessionUuid;
}
