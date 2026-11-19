import { headers } from "next/headers";

function isValidIpv6(candidate: string): boolean {
  if (!candidate || candidate.length > 45) return false;
  if (!/^[a-fA-F0-9:]+$/.test(candidate)) return false;
  if (candidate.includes(":::")) return false;

  const doubleColonParts = candidate.split("::");
  if (doubleColonParts.length > 2) return false;

  const hasCompression = doubleColonParts.length === 2;
  if (!hasCompression) {
    const groups = candidate.split(":");
    return groups.length === 8 && groups.every((g) => /^[a-fA-F0-9]{1,4}$/.test(g));
  }

  const leftGroups = doubleColonParts[0] ? doubleColonParts[0].split(":") : [];
  const rightGroups = doubleColonParts[1] ? doubleColonParts[1].split(":") : [];

  // Reject leading/trailing single colon like ":1::2" or "1::2:"
  if (leftGroups.some((g) => !/^[a-fA-F0-9]{1,4}$/.test(g))) return false;
  if (rightGroups.some((g) => !/^[a-fA-F0-9]{1,4}$/.test(g))) return false;

  return leftGroups.length + rightGroups.length < 8;
}

export function sanitizeIp(ip: string): string {
  if (!ip || typeof ip !== "string") return "127.0.0.1";
  let trimmed = ip.trim();
  const lower = trimmed.toLowerCase();
  if (lower === "::1" || lower === "::ffff:127.0.0.1" || lower === "localhost") return "127.0.0.1";
  if (lower.startsWith("::ffff:")) {
    trimmed = trimmed.substring(7);
    if (trimmed === "127.0.0.1") return "127.0.0.1";
  }

  const ipv4Match = trimmed.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
  if (ipv4Match) {
    const octets = ipv4Match[0].split(".").map(Number);
    if (octets.every((o) => o >= 0 && o <= 255)) return ipv4Match[0];
  }

  if (trimmed.includes(":")) {
    const bracketMatch = trimmed.match(/^\[([^\]]+)\](?::\d{1,5})?$/);
    const candidate = bracketMatch ? bracketMatch[1] : trimmed;
    if (isValidIpv6(candidate)) {
      if (candidate === "::1") return "127.0.0.1";
      return candidate.toLowerCase();
    }
  }
  return "127.0.0.1";
}

type HeaderRecord = Record<string, string | string[] | undefined>;
type HeaderInput = Headers | HeaderRecord;

function resolveClientIp(customHeaders: HeaderInput): string {
  try {
    const headerList = typeof (customHeaders as Headers).get === "function"
      ? customHeaders as Headers
      : {
          get: (name: string) => {
            const val = (customHeaders as HeaderRecord)[name.toLowerCase()] ?? (customHeaders as HeaderRecord)[name];
            if (Array.isArray(val)) return val[0] || null;
            return typeof val === "string" ? val : null;
          },
        };

    const cfConnectingIp = headerList.get("cf-connecting-ip");
    if (cfConnectingIp) return sanitizeIp(cfConnectingIp);
    const forwardedFor = headerList.get("x-forwarded-for");
    if (forwardedFor) {
      const first = forwardedFor.split(",")[0].trim();
      if (first) return sanitizeIp(first);
    }
    const realIp = headerList.get("x-real-ip");
    if (realIp) return sanitizeIp(realIp);
    return "127.0.0.1";
  } catch {
    return "127.0.0.1";
  }
}

/** Synchronous when request headers are supplied; async in Server Actions using Next's request context. */
export function getClientIp(customHeaders: HeaderInput | null | undefined): string;
export function getClientIp(): Promise<string>;
export function getClientIp(customHeaders?: HeaderInput | null): string | Promise<string> {
  if (arguments.length > 0) return customHeaders ? resolveClientIp(customHeaders) : "127.0.0.1";
  const requestHeaders = headers();
  if (!requestHeaders || typeof (requestHeaders as any).then !== "function") {
    return Promise.resolve("127.0.0.1");
  }
  return requestHeaders.then(resolveClientIp).catch(() => "127.0.0.1");
}
