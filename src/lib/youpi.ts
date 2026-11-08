import crypto from "crypto";

export interface YoupiCustomer {
  name?: string;
  email?: string;
  phone?: string;
}

export interface YoupiCreateSessionOptions {
  orderId: string;
  amount: number;
  currency?: string;
  customer?: YoupiCustomer;
  metadata?: Record<string, any>;
  returnUrl?: string;
}

export interface YoupiSessionResponse {
  paymentId: string;
  orderId: string;
  amount: string;
  amountPaise: number | string;
  currency: string;
  status: string;
  checkoutUrl: string;
}

/**
 * Creates an authoritative payment session via the YOUPI PG Payment Core API.
 */
export async function createYoupiSession(
  options: YoupiCreateSessionOptions
): Promise<YoupiSessionResponse> {
  const apiUrl = process.env.YOUPI_API_URL || "http://localhost:6100";
  const merchantId = process.env.YOUPI_MERCHANT_ID || "d68333a5-27a3-482e-bf85-db3905ffacd9";
  const apiKey = process.env.YOUPI_API_KEY || "";
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:9002";

  const payload = {
    orderId: options.orderId,
    amount: Number(options.amount).toFixed(2),
    currency: options.currency || "INR",
    returnUrl: options.returnUrl || `${appBaseUrl}/donate?status=success&orderId=${encodeURIComponent(options.orderId)}`,
    customer: options.customer,
    metadata: options.metadata || {},
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Merchant-Id": merchantId,
  };

  if (apiKey) {
    headers["X-Merchant-Key"] = apiKey;
  }

  const res = await fetch(`${apiUrl}/api/v1/payments`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`YOUPI Gateway API returned HTTP ${res.status}: ${errorText}`);
  }

  return (await res.json()) as YoupiSessionResponse;
}

/**
 * Authoritatively verifies the HMAC-SHA256 signature delivered with YOUPI webhooks.
 * Uses timingSafeEqual to protect against side-channel timing attacks.
 */
export function verifyYoupiSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false;

  const cleanSignature = signatureHeader.trim();
  const expected =
    "sha256=" +
    crypto
      .createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest("hex");

  if (cleanSignature.length !== expected.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(cleanSignature, "utf8"),
      Buffer.from(expected, "utf8")
    );
  } catch {
    return false;
  }
}
