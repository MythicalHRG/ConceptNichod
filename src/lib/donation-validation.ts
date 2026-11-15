export type PatronTier = "Supporter" | "Patron" | "Benefactor" | "Legend";

export function sanitizePlainText(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

export function normalizeDonorName(value: unknown): string | null {
  const name = sanitizePlainText(value, 60).replace(/\s+/g, " ");
  return name.length >= 2 ? name : null;
}

export function normalizeUtr(value: unknown): string | null {
  const utr = String(value ?? "").trim();
  if (!/^\d{12}$/.test(utr) || /^([0-9])\1{11}$/.test(utr)) return null;
  return utr;
}

export function normalizeTransactionId(value: unknown): string | null {
  const id = String(value ?? "").trim();
  return /^[A-Za-z0-9_-]{6,45}$/.test(id) ? id : null;
}

export function normalizeDonationMessage(value: unknown): string {
  return sanitizePlainText(value, 250);
}

export function parseVerifiedAmount(value: unknown): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) return null;
  const paise = Math.round(amount * 100);
  return Math.abs(amount * 100 - paise) <= 1e-7 ? paise / 100 : null;
}

export function computePatronTier(amount: number): PatronTier {
  if (amount >= 2500) return "Legend";
  if (amount >= 1000) return "Benefactor";
  if (amount >= 500) return "Patron";
  return "Supporter";
}

// Backward-compatible helpers used by older UI/tests and historical actions.
export function parseDonationAmount(value: unknown): number | null {
  return parseVerifiedAmount(value);
}
export function normalizeUpiReference(value: unknown): string | null {
  const text = String(value ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{8,20}$/.test(text) ? text : null;
}
export function normalizeVpa(value: unknown): string | null {
  const vpa = String(value ?? "").trim().toLowerCase();
  return /^[a-z0-9._-]{2,256}@[a-z0-9.-]{2,64}$/.test(vpa) ? vpa : null;
}
export function isExactDonationMatch(claimedAmount: number, receivedAmount: number, configuredVpa: string, receivedVpa: string): boolean {
  return Number.isFinite(claimedAmount) && Number.isFinite(receivedAmount) &&
    Math.round(claimedAmount * 100) === Math.round(receivedAmount * 100) &&
    configuredVpa.trim().toLowerCase() === receivedVpa.trim().toLowerCase();
}
