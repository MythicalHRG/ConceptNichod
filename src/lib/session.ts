import crypto from "crypto";

function cleanSessionSecret(value?: string): string {
  return (value || "").trim().replace(/^[\"']+|[\"']+$/g, "").trim();
}

function getSessionSecret(): string {
  const configured = cleanSessionSecret(process.env.SESSION_SECRET) || cleanSessionSecret(process.env.ENCRYPTION_SECRET_KEY);
  if (configured) {
    if (process.env.NODE_ENV === "production" && Buffer.byteLength(configured, "utf8") < 32) {
      throw new Error("SESSION_SECRET or ENCRYPTION_SECRET_KEY must contain at least 32 bytes in production.");
    }
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET or ENCRYPTION_SECRET_KEY must be configured with a strong random secret in production.");
  }
  return "local-development-only-session-secret-not-for-production";
}
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;\nconst SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export function createSignedSessionCookie(uuid: string, sessionVersion = 0): string {
  if (!uuid || typeof uuid !== "string") throw new Error("UUID is required to create a session cookie.");
  const trimmedUuid = uuid.trim();
  if (!UUID_REGEX.test(trimmedUuid)) throw new Error("A valid UUID is required to create a session cookie.");
  const safeVersion = Number.isSafeInteger(sessionVersion) && sessionVersion >= 0 ? sessionVersion : 0;
  const signature = crypto.createHmac("sha256", getSessionSecret()).update(`${trimmedUuid}.${safeVersion}`).digest("hex");
  return `${trimmedUuid}.${safeVersion}.${signature}`;
}

export function getSessionVersionFromCookie(cookieValue?: string | null): number | null {
  if (!cookieValue || typeof cookieValue !== "string") return null;
  const parts = cookieValue.trim().split(".");
  if (parts.length === 2 && UUID_REGEX.test(parts[0]) && /^[a-f0-9]{64}$/i.test(parts[1])) return 0;
  if (parts.length !== 3 || !UUID_REGEX.test(parts[0]) || !/^(0|[1-9]\d*)$/.test(parts[1]) || !/^[a-f0-9]{64}$/i.test(parts[2])) return null;
  const version = Number(parts[1]);
  return Number.isSafeInteger(version) && version >= 0 ? version : null;
}

export function verifySessionCookie(cookieValue?: string | null): string | null {
  if (!cookieValue || typeof cookieValue !== "string") return null;
  const trimmed = cookieValue.trim();
  const parts = trimmed.split(".");
  if (parts.length === 3) {
    const [uuid, versionText, signature] = parts;
    if (!UUID_REGEX.test(uuid) || !/^(0|[1-9]\d*)$/.test(versionText) || !/^[a-f0-9]{64}$/i.test(signature)) return null;
    const version = Number(versionText);
    if (!Number.isSafeInteger(version) || version < 0) return null;
    const expectedBuf = crypto.createHmac("sha256", getSessionSecret()).update(`${uuid}.${version}`).digest();
    const sigBuf = Buffer.from(signature, "hex");
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf) ? uuid : null;
  }
  // Legacy signed tokens remain accepted during migration and are version zero.
  const dotIndex = trimmed.lastIndexOf(".");
  if (dotIndex > 0) {
    const uuid = trimmed.substring(0, dotIndex);
    const signature = trimmed.substring(dotIndex + 1);
    if (!UUID_REGEX.test(uuid) || !/^[a-f0-9]{64}$/i.test(signature)) return null;
    const expectedBuf = crypto.createHmac("sha256", getSessionSecret()).update(uuid).digest();
    const sigBuf = Buffer.from(signature, "hex");
    if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) return uuid;
  }
  if (process.env.NODE_ENV !== "production" && process.env.STRICT_SESSION_SIGNING !== "true" && UUID_REGEX.test(trimmed)) return trimmed;
  return null;
}
