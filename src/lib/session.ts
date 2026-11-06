import crypto from "crypto";

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET || process.env.ENCRYPTION_SECRET_KEY;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV !== "production") {
    return "local-development-only-session-secret";
  }
  throw new Error("SESSION_SECRET must be configured with at least 32 characters.");
}
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
      .createHmac("sha256", getSessionSecret())
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

  return null;
}
