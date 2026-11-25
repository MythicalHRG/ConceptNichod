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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export function createSignedSessionCookie(uuid: string, sessionVersion = 0): string {
  if (!uuid || typeof uuid !== "string") throw new Error("UUID is required to create a session cookie.");
  const trimmedUuid = uuid.trim();
  if (!UUID_REGEX.test(trimmedUuid)) throw new Error("A valid UUID is required to create a session cookie.");
  if (!Number.isSafeInteger(sessionVersion) || sessionVersion < 0) {
    throw new Error("A valid non-negative session version is required.");
  }
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const signature = crypto.createHmac("sha256", getSessionSecret())
    .update(`${trimmedUuid}.${sessionVersion}.${expiresAt}`)
    .digest("hex");
  return `${trimmedUuid}.${sessionVersion}.${expiresAt}.${signature}`;
}

export function getSessionVersionFromCookie(cookieValue?: string | null): number | null {
  if (!cookieValue || typeof cookieValue !== "string") return null;
  const parts = cookieValue.trim().split(".");
  if (parts.length !== 4 || !UUID_REGEX.test(parts[0]) || !/^(0|[1-9]\d*)$/.test(parts[1]) ||
      !/^(0|[1-9]\d*)$/.test(parts[2]) || !/^[a-f0-9]{64}$/i.test(parts[3])) return null;
  const version = Number(parts[1]);
  return Number.isSafeInteger(version) && version >= 0 ? version : null;
}

export function verifySessionCookie(cookieValue?: string | null): string | null {
  if (!cookieValue || typeof cookieValue !== "string") return null;
  const trimmed = cookieValue.trim();
  const parts = trimmed.split(".");
  if (parts.length === 4) {
    const [uuid, versionText, expiryText, signature] = parts;
    if (!UUID_REGEX.test(uuid) || !/^(0|[1-9]\d*)$/.test(versionText) ||
        !/^(0|[1-9]\d*)$/.test(expiryText) || !/^[a-f0-9]{64}$/i.test(signature)) return null;
    const version = Number(versionText);
    const expiresAt = Number(expiryText);
    if (!Number.isSafeInteger(version) || version < 0 || !Number.isSafeInteger(expiresAt) ||
        expiresAt <= Math.floor(Date.now() / 1000)) return null;
    const expected = crypto.createHmac("sha256", getSessionSecret())
      .update(`${uuid}.${version}.${expiresAt}`)
      .digest();
    const supplied = Buffer.from(signature, "hex");
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected) ? uuid : null;
  }
  // Only local development may accept the historical unsigned UUID fixture.
  if (process.env.NODE_ENV !== "production" && process.env.STRICT_SESSION_SIGNING !== "true" && UUID_REGEX.test(trimmed)) return trimmed;
  return null;
}
