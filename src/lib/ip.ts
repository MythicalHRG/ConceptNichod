import { headers } from "next/headers";

export function sanitizeIp(ip: string): string {
  if (!ip || typeof ip !== "string") return "127.0.0.1";

  let trimmed = ip.trim();
  // Normalize IPv6 localhost/IPv4-mapped IPv6
  if (
    trimmed === "::1" ||
    trimmed === "::ffff:127.0.0.1" ||
    trimmed === "localhost"
  ) {
    return "127.0.0.1";
  }

  // Strip ::ffff: prefix from IPv4-mapped IPv6
  if (trimmed.startsWith("::ffff:")) {
    trimmed = trimmed.substring(7);
    if (trimmed === "127.0.0.1") return "127.0.0.1";
  }

  // Check for valid IPv4 address (e.g. "192.168.1.1; DROP TABLE users" -> "192.168.1.1")
  const ipv4Match = trimmed.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
  if (ipv4Match) {
    const octets = ipv4Match[0].split(".").map(Number);
    if (octets.every((o) => o >= 0 && o <= 255)) {
      return ipv4Match[0];
    }
  }

  // Check for IPv6 address
  if (trimmed.includes(":")) {
    const ipv6Clean = trimmed.replace(/[^a-fA-F0-9:]/g, "");
    if (/^[a-fA-F0-9:]+$/.test(ipv6Clean) && ipv6Clean.split(":").length >= 3) {
      if (ipv6Clean === "::1") return "127.0.0.1";
      return ipv6Clean.slice(0, 45);
    }
  }

  return "127.0.0.1";
}

export async function getClientIp(
  customHeaders?: Headers | Record<string, string | string[] | undefined> | null
): Promise<string> {
  try {
    let headerList: { get: (name: string) => string | null } | null = null;

    if (customHeaders) {
      if (typeof (customHeaders as any).get === "function") {
        headerList = customHeaders as any;
      } else {
        headerList = {
          get: (name: string) => {
            const val =
              (customHeaders as any)[name.toLowerCase()] ||
              (customHeaders as any)[name];
            if (Array.isArray(val)) return val[0] || null;
            return typeof val === "string" ? val : null;
          },
        };
      }
    } else {
      headerList = await headers();
    }

    if (!headerList) return "127.0.0.1";

    // Cloudflare priority
    const cfConnectingIp = headerList.get("cf-connecting-ip");
    if (cfConnectingIp) {
      return sanitizeIp(cfConnectingIp);
    }

    // Standard reverse proxy header (leftmost client IP)
    const forwardedFor = headerList.get("x-forwarded-for");
    if (forwardedFor) {
      const first = forwardedFor.split(",")[0].trim();
      if (first) {
        return sanitizeIp(first);
      }
    }

    // Nginx / general reverse proxy
    const realIp = headerList.get("x-real-ip");
    if (realIp) {
      return sanitizeIp(realIp);
    }

    return "127.0.0.1";
  } catch {
    return "127.0.0.1";
  }
}
