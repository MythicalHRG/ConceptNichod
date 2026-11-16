const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getSessionSecret(): string {
  const configured = (process.env.SESSION_SECRET || process.env.ENCRYPTION_SECRET_KEY || "").trim().replace(/^(['"])(.*)\\1$/, "$2").trim();
  if (configured) {
    if (process.env.NODE_ENV === "production" && new TextEncoder().encode(configured).length < 32) {
      throw new Error("SESSION_SECRET or ENCRYPTION_SECRET_KEY must contain at least 32 bytes in production.");
    }
    return configured;
  }
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET or ENCRYPTION_SECRET_KEY must be configured with a strong random secret in production.");
  return "local-development-only-session-secret-not-for-production";
}

/** Edge-runtime equivalent of verifySessionCookie; uses Web Crypto, not Node crypto. */
export async function verifyEdgeSessionCookie(cookieValue?: string | null): Promise<string | null> {
  if (!cookieValue || typeof cookieValue !== "string") return null;
  const trimmed = cookieValue.trim();
  const dotIndex = trimmed.lastIndexOf(".");
  if (dotIndex > 0) {
    const uuid = trimmed.slice(0, dotIndex);
    const signature = trimmed.slice(dotIndex + 1);
    if (UUID_REGEX.test(uuid) && /^[a-f0-9]{64}$/i.test(signature)) {
      const secret = getSessionSecret();
      const key = await globalThis.crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
      const signatureBytes = new Uint8Array(signature.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
      const valid = await globalThis.crypto.subtle.verify("HMAC", key, signatureBytes, new TextEncoder().encode(uuid));
      if (valid) return uuid;
    }
  }
  if (process.env.NODE_ENV !== "production" && process.env.STRICT_SESSION_SIGNING !== "true" && UUID_REGEX.test(trimmed)) return trimmed;
  return null;
}
