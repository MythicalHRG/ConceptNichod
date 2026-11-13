import crypto from "crypto";

function getSessionSecret(): string {
  const configured = process.env.ENCRYPTION_SECRET_KEY?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("ENCRYPTION_SECRET_KEY must be configured with a strong random secret in production.");
  }
  return "local-development-only-session-secret-not-for-production";
}
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createSignedSessionCookie(uuid: string): string {
  if (!uuid || typeof uuid !== "string") {
    throw new Error("UUID is required to create a session cookie.");
  }
  const signature = crypto.createHmac("sha256", getSessionSecret()).update(uuid).digest("hex");
  return `${uuid}.${signature}`;
}

export function verifySessionCookie(cookieValue?: string | null): string | null {
  if (!cookieValue || typeof cookieValue !== "string") {
    return null;
  }

  const trimmed = cookieValue.trim();
  const dotIndex = trimmed.lastIndexOf(".");

  if (dotIndex > 0) {
    const uuid = trimmed.substring(0, dotIndex);
    const signature = trimmed.substring(dotIndex + 1);

    const expectedSignature = crypto
      .createHmac("sha256", SECRET)
      .update(uuid)
      .digest("hex");
    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSignature);

    if (
      sigBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(sigBuf, expectedBuf)
    ) {
      return uuid;
    }
  }

  // Security Hardening: In production or strict mode, unsigned UUIDs are strictly rejected to prevent account takeover.
  // Legacy unsigned UUIDs are only tolerated during non-production test suites if not in strict mode.
  if (process.env.NODE_ENV !== "production" && process.env.STRICT_SESSION_SIGNING !== "true") {
    if (UUID_REGEX.test(trimmed)) {
      return trimmed;
    }
  }

  return null;
}
