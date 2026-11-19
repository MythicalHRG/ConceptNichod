/**
 * Email normalization and canonicalization utilities.
 * Prevents email subaddressing (+tags) and Gmail dot-variation abuse.
 */

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/**
 * Strips whitespace and converts to lowercase.
 */
export function normalizeEmail(email: string): string {
  if (!email || typeof email !== "string") return "";
  return email.trim().toLowerCase();
}

/**
 * Returns the canonical form of an email address for uniqueness and anti-abuse checks:
 * - Lowercases and trims
 * - Strips `+tag` subaddressing from the local part (all providers)
 * - Strips trailing DNS root dots from the domain
 * - Removes dots `.` from the local part for Gmail/Googlemail domains
 * - Normalizes `googlemail.com` to `gmail.com`
 */
export function canonicalizeEmail(email: string): string {
  const normalized = normalizeEmail(email);
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === normalized.length - 1) return normalized;

  let local = normalized.slice(0, atIndex);
  let domain = normalized.slice(atIndex + 1).replace(/\.+$/, "");
  if (!domain) return normalized;

  // Strip +subaddressing tag (e.g., user+spam@example.com -> user@example.com)
  const plusIndex = local.indexOf("+");
  if (plusIndex !== -1) {
    local = local.slice(0, plusIndex);
  }

  // Normalize Gmail/Googlemail domain and strip dots from local part
  if (GMAIL_DOMAINS.has(domain)) {
    domain = "gmail.com";
    local = local.replace(/\./g, "");
  }

  return `${local}@${domain}`;
}

/**
 * Checks if an email address contains a `+` subaddressing tag in the local part.
 */
export function hasSubaddressTag(email: string): boolean {
  const normalized = normalizeEmail(email);
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex <= 0) return false;
  const local = normalized.slice(0, atIndex);
  return local.includes("+");
}
