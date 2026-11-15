export type PatronTier = "LEGEND" | "DIAMOND" | "GOLD" | "SILVER" | "SUPPORTER" | "Legend" | "Benefactor" | "Patron" | "Supporter";

export interface DonationSubmissionInput {
  donorName: string; utr: string; transactionId: string; message?: string; isAnonymous?: boolean;
}
export interface ValidationResult<T> { valid: boolean; data?: T; error?: string; }

export function sanitizeDonationText(input: unknown, maxLength = 250): string {
  if (typeof input !== "string") return "";
  return input.replace(/<[^>]*>?/gm, "").replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim().slice(0, maxLength);
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
  const donorName = sanitizeDonationText(payload.donorName, 60).replace(/\s+/g, " ");
  if (donorName.length < 2) return { valid: false, error: "Please enter your name (at least 2 characters)." };
  const utr = validateUtr(payload.utr); if (!utr.valid || !utr.data) return { valid: false, error: utr.error };
  const transactionId = validateTransactionId(payload.transactionId); if (!transactionId.valid || !transactionId.data) return { valid: false, error: transactionId.error };
  return { valid: true, data: { donorName, utr: utr.data, transactionId: transactionId.data, message: sanitizeDonationText(payload.message, 250), isAnonymous: payload.isAnonymous === true } };
}
export function validateAdminVerifiedAmount(raw: unknown): ValidationResult<number> {
  const amount = typeof raw === "string" ? Number(raw.trim()) : Number(raw);
  if (!Number.isFinite(amount) || amount < 1 || amount > 10000000) return { valid: false, error: "Enter a verified amount between ₹1 and ₹1,00,00,000." };
  return { valid: true, data: Math.round(amount * 100) / 100 };
}
export function computePatronTier(amount: number): PatronTier {
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
export function normalizeVpa(value: unknown): string | null { if(typeof value!=="string")return null;const v=value.trim().toLowerCase();return /^[a-z0-9._-]{2,256}@[a-z0-9.-]{2,64}$/.test(v)?v:null; }
export function isExactDonationMatch(a:number,b:number,c:string,d:string):boolean { return Number.isFinite(a)&&Number.isFinite(b)&&Math.round(a*100)===Math.round(b*100)&&c.trim().toLowerCase()===d.trim().toLowerCase(); }
