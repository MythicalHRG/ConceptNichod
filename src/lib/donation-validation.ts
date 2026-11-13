export function parseDonationAmount(value: unknown): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 1 || amount > 1000000) return null;
  const paise = Math.round(amount * 100);
  // Floating-point representation can make valid values such as 12.34
  // appear to have extra decimal places. Compare with a small precision tolerance.
  if (Math.abs(amount * 100 - paise) > 1e-7) return null;
  return paise / 100;
}

export function normalizeUpiReference(value: unknown): string | null {
  const reference = String(value ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{8,20}$/.test(reference) ? reference : null;
}

export function normalizeVpa(value: unknown): string | null {
  const vpa = String(value ?? "").trim().toLowerCase();
  return /^[a-z0-9._-]{2,256}@[a-z0-9.-]{2,64}$/.test(vpa) ? vpa : null;
}

export function isExactDonationMatch(claimedAmount: number, receivedAmount: number, configuredVpa: string, receivedVpa: string): boolean {
  return Number.isFinite(claimedAmount) &&
    Number.isFinite(receivedAmount) &&
    Math.round(claimedAmount * 100) === Math.round(receivedAmount * 100) &&
    configuredVpa.trim().toLowerCase() === receivedVpa.trim().toLowerCase();
}
