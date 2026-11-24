export type PatronTier = "LEGEND" | "DIAMOND" | "GOLD" | "SILVER" | "SUPPORTER" | "Legend" | "Benefactor" | "Patron" | "Supporter";

export interface DonationSubmissionInput {
  donorName: string; utr: string; transactionId: string; message?: string; isAnonymous?: boolean;
}
export interface ValidationResult<T> { valid: boolean; data?: T; error?: string; }

export function sanitizeDonationText(input: unknown, maxLength = 250): string {
  if (typeof input !== "string") return "";
  const safeMax = Number.isFinite(maxLength) ? Math.max(0, Math.floor(maxLength)) : 250;
  let cleaned = input.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
  let prev: string;
  do {
    prev = cleaned;
    cleaned = cleaned.replace(/<[^<>]*>/g, "");
  } while (cleaned !== prev);
  cleaned = cleaned.replace(/[<>]/g, "");
  return cleaned.trim().slice(0, safeMax);
}
export function validateUtr(rawUtr: unknown): ValidationResult<string> {
  if (typeof rawUtr !== "string") return { valid: false, error: "UTR number is required." };
  const normalized = rawUtr.replace(/\s+/g, "").trim();
  if (!/^\d{12}$/.test(normalized) || /^(\d)\1{11}$/.test(normalized)) return { valid: false, error: "UTR must be a genuine exact 12-digit numeric reference." };
  return { valid: true, data: normalized };
}
export function validateTransactionId(raw: unknown): ValidationResult<string> {
  if (typeof raw !== "string") return { valid: false, error: "Transaction ID is required." };
  const normalized = raw.replace(/\s+/g, "").trim().toUpperCase();
  if (!/^[A-Z0-9_-]{6,45}$/.test(normalized)) return { valid: false, error: "Transaction ID must be 6–45 alphanumeric characters." };
  return { valid: true, data: normalized };
}
export function validateDonationSubmission(payload: Record<string, unknown>): ValidationResult<DonationSubmissionInput> {
  if (!payload || typeof payload !== "object") return { valid: false, error: "Invalid donation submission payload." };
  const donorName = sanitizeDonationText(payload.donorName, 60).replace(/\s+/g, " ");
  if (donorName.length < 2) return { valid: false, error: "Please enter your name (at least 2 characters)." };
  const utr = validateUtr(payload.utr); if (!utr.valid || !utr.data) return { valid: false, error: utr.error };
  const transactionId = validateTransactionId(payload.transactionId); if (!transactionId.valid || !transactionId.data) return { valid: false, error: transactionId.error };
  return { valid: true, data: { donorName, utr: utr.data, transactionId: transactionId.data, message: sanitizeDonationText(payload.message, 250), isAnonymous: payload.isAnonymous === true } };
}
export function validateAdminVerifiedAmount(raw: unknown): ValidationResult<number> {
  let amount: number;
  if (typeof raw === "number") {
    amount = raw;
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return { valid: false, error: "Enter a verified amount between INR 1 and INR 1,00,00,000." };
    amount = Number(trimmed);
  } else {
    return { valid: false, error: "Enter a verified amount between INR 1 and INR 1,00,00,000." };
  }
  if (!Number.isFinite(amount) || amount < 1 || amount > 10000000) return { valid: false, error: "Enter a verified amount between INR 1 and INR 1,00,00,000." };
  return { valid: true, data: Math.round(amount * 100) / 100 };
}
export function computePatronTier(amount: number): PatronTier {
  if (!Number.isFinite(amount) || amount < 1) return "SUPPORTER";
  if (amount >= 5000) return "LEGEND"; if (amount >= 2000) return "DIAMOND"; if (amount >= 500) return "GOLD"; if (amount >= 100) return "SILVER"; return "SUPPORTER";
}
// Backward-compatible helper exports used by existing ConceptNichod modules and tests.
export function sanitizePlainText(value: unknown, maxLength: number): string { return sanitizeDonationText(typeof value === "string" ? value : String(value ?? ""), maxLength); }
export function normalizeDonorName(value: unknown): string | null { const v=sanitizeDonationText(value,60).replace(/\s+/g," "); return v.length>=2?v:null; }
export function normalizeUtr(value: unknown): string | null { const r=validateUtr(value); return r.valid?r.data??null:null; }
export function normalizeTransactionId(value: unknown): string | null { const r=validateTransactionId(value); return r.valid?r.data??null:null; }
export function normalizeDonationMessage(value: unknown): string { return sanitizeDonationText(value,250); }
export function parseVerifiedAmount(value: unknown): number | null { const r=validateAdminVerifiedAmount(value); return r.valid?r.data??null:null; }
export function parseDonationAmount(value: unknown): number | null { return parseVerifiedAmount(value); }
export function normalizeUpiReference(value: unknown): string | null { return normalizeUtr(value); }
export function normalizeVpa(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) return null;
  const v = value.toLowerCase();
  if (!/^[a-zA-Z0-9._-]{2,64}@[a-zA-Z0-9.-]{2,64}$/.test(value)) return null;
  if (/[<>\s/\\:]/.test(value) || value.includes("..") || value.includes("@.") || value.endsWith(".")) return null;
  if (/^(?:example|yourname|test|placeholder)@(?:upi|ybl|okaxis|oksbi|okhdfcbank|okicici|paytm|ibl|axl|ptyes|ptaxis)$/i.test(v)) return null;
  return v;
}
export function isExactDonationMatch(a:number,b:number,c:string,d:string):boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b) || typeof c !== "string" || typeof d !== "string") return false;
  const normC = c.trim().toLowerCase();
  const normD = d.trim().toLowerCase();
  if (!normC || !normD) return false;
  return Math.round(a*100)===Math.round(b*100) && normC===normD;
}
