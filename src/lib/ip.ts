import { headers } from "next/headers";

export function sanitizeIp(ip: string): string {
  if (!ip || typeof ip !== "string") return "127.0.0.1";
  let trimmed = ip.trim();
  if (trimmed === "::1" || trimmed === "::ffff:127.0.0.1" || trimmed === "localhost") return "127.0.0.1";
  if (trimmed.startsWith("::ffff:")) {
    trimmed = trimmed.substring(7);
    if (trimmed === "127.0.0.1") return "127.0.0.1";
  }
  const ipv4Match = trimmed.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
  if (ipv4Match) {
    const octets = ipv4Match[0].split(".").map(Number);
    if (octets.every((o) => o >= 0 && o <= 255)) return ipv4Match[0];
  }
  if (trimmed.includes(":")) {
    const ipv6Clean = trimmed.replace(/[^a-fA-F0-9:]/g, "");
    if (/^[a-fA-F0-9:]+$/.test(ipv6Clean) && ipv6Clean.split(":").length >= 3) {
      if (ipv6Clean === "::1") return "127.0.0.1";
      return ipv6Clean.slice(0, 45);
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
export function getClientIp(customHeaders: HeaderInput): string;
export function getClientIp(): Promise<string>;
export function getClientIp(customHeaders?: HeaderInput): string | Promise<string> {
  if (customHeaders) return resolveClientIp(customHeaders);
  return headers().then(resolveClientIp).catch(() => "127.0.0.1");
}
