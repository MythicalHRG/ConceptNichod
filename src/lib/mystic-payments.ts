import crypto from "crypto";

export interface MysticCustomer {
  name?: string;
  email?: string;
  phone?: string;
}

export interface MysticCreateSessionOptions {
  orderId: string;
  amount: number;
  currency?: string;
  customer?: MysticCustomer;
  metadata?: Record<string, any>;
  returnUrl?: string;
  method?: string;
}

export interface MysticSessionResponse {
  paymentId: string;
  orderId: string;
  amount: string;
  amountPaise: number | string;
  currency: string;
  status: string;
  checkoutUrl: string;
}

export interface MysticPaymentsConfig {
  apiUrl: string;
  gatewayUrl: string;
  merchantId: string;
  apiKey: string;
  webhookSecret: string;
  appUrl: string;
}

export class StrictCredentialError extends Error {
  constructor(message: string) {
    super(`[MysticPayments Strict Security] ${message}`);
    this.name = "StrictCredentialError";
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Strips UTF-8 Byte Order Marks (\uFEFF), zero-width spaces (\u200B, \u200C, \u200D),
 * whitespace, and normalizes protocol slashes to produce a clean, valid URL.
 */
export function cleanAndValidateUrl(url: string | null | undefined): string {
  if (!url || typeof url !== "string") return "";
  let clean = url.replace(/^[\uFEFF\u200B\u200C\u200D\s]+/, "").trim();
  // Fix accidental single-slash protocol e.g. "https:/mystic"
  clean = clean.replace(/^(https?:)\/([^\/])/, "$1//$2");
  try {
    const parsed = new URL(clean);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString();
    }
  } catch {}
  return clean;
}

/**
 * Authoritatively retrieves and strictly validates MysticPayments configuration.
 * In production, fails closed immediately if required cryptographic secrets or identifiers are absent or malformed.
 */
export function getStrictMysticConfig(): MysticPaymentsConfig {
  const isProd = process.env.NODE_ENV === "production";

  const apiUrl = (
    process.env.MYSTIC_PAYMENTS_API_URL ||
    process.env.YOUPI_API_URL ||
    ""
  ).trim().replace(/\/+$/, "");

  const gatewayUrl = (
    process.env.MYSTIC_PAYMENTS_GATEWAY_URL ||
    process.env.YOUPI_GATEWAY_URL ||
    process.env.NEXT_PUBLIC_MYSTIC_PAYMENTS_GATEWAY_URL ||
    process.env.NEXT_PUBLIC_YOUPI_GATEWAY_URL ||
    ""
  ).trim().replace(/\/+$/, "");

  const merchantId = (
    process.env.MYSTIC_PAYMENTS_MERCHANT_ID ||
    process.env.YOUPI_MERCHANT_ID ||
    ""
  ).trim();

  const apiKey = (
    process.env.MYSTIC_PAYMENTS_API_KEY ||
    process.env.YOUPI_API_KEY ||
    ""
  ).trim();

  const webhookSecret = (
    process.env.MYSTIC_PAYMENTS_WEBHOOK_SECRET ||
    process.env.YOUPI_WEBHOOK_SECRET ||
    ""
  ).trim();

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    (isProd ? "https://conceptnichod.vercel.app" : "http://localhost:9002")
  ).trim().replace(/\/+$/, "");

  // Strict enforcement in production
  if (isProd) {
    if (!merchantId) {
      throw new StrictCredentialError("Missing MYSTIC_PAYMENTS_MERCHANT_ID environment variable.");
    }
    if (!UUID_REGEX.test(merchantId)) {
      throw new StrictCredentialError("MYSTIC_PAYMENTS_MERCHANT_ID must be a valid UUID format.");
    }
    if (!apiKey) {
      throw new StrictCredentialError("Missing MYSTIC_PAYMENTS_API_KEY production secret.");
    }
    if (apiKey.length < 24) {
      throw new StrictCredentialError("MYSTIC_PAYMENTS_API_KEY fails length complexity bounds (minimum 24 characters).");
    }
    if (!webhookSecret) {
      throw new StrictCredentialError("Missing MYSTIC_PAYMENTS_WEBHOOK_SECRET HMAC signing key.");
    }
    if (webhookSecret.length < 32) {
      throw new StrictCredentialError("MYSTIC_PAYMENTS_WEBHOOK_SECRET must be at least 32 characters.");
    }
    if (!apiUrl) {
      throw new StrictCredentialError("Missing MYSTIC_PAYMENTS_API_URL endpoint.");
    }
  }

  return {
    apiUrl: apiUrl || "http://localhost:6100",
    gatewayUrl: gatewayUrl || "http://localhost:7000",
    merchantId: merchantId || "d68333a5-27a3-482e-bf85-db3905ffacd9",
    apiKey: apiKey || "",
    webhookSecret: webhookSecret || "",
    appUrl: appUrl || "http://localhost:9002",
  };
}

/**
 * Creates an authoritative payment session via MysticPayments Payment API.
 * Enforces strictly valid credentials, parameters, and headers.
 */
export async function createMysticSession(
  options: MysticCreateSessionOptions
): Promise<MysticSessionResponse> {
  if (!options || typeof options !== "object") {
    throw new Error("createMysticSession: options object is required");
  }

  if (!options.orderId || typeof options.orderId !== "string") {
    throw new Error("createMysticSession: valid orderId string is required");
  }

  const numericAmount = Number(options.amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error("createMysticSession: amount must be a positive number greater than 0");
  }

  const config = getStrictMysticConfig();

  // In production, an empty apiKey cannot be sent
  if (process.env.NODE_ENV === "production" && !config.apiKey) {
    throw new StrictCredentialError("Cannot initiate payment session without a configured API key");
  }

  const payload = {
    orderId: options.orderId.trim(),
    amount: numericAmount.toFixed(2),
    currency: (options.currency || "INR").toUpperCase(),
    returnUrl:
      options.returnUrl ||
      `${config.appUrl}/donate?status=success&orderId=${encodeURIComponent(options.orderId)}`,
    customer: options.customer,
    method: options.method || "MANUAL_UPI",
    metadata: {
      ...options.metadata,
      gateway: "MysticPayments",
      integrationVersion: "2.0.0",
    },
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Merchant-Id": config.merchantId,
  };

  if (config.apiKey) {
    headers["X-Merchant-Key"] = config.apiKey;
  }

  const res = await fetch(`${config.apiUrl}/api/v1/payments`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`MysticPayments API returned HTTP ${res.status}: ${errorText}`);
  }

  const responseJson = (await res.json()) as MysticSessionResponse;
  if (responseJson && responseJson.checkoutUrl) {
    responseJson.checkoutUrl = cleanAndValidateUrl(responseJson.checkoutUrl);
  }
  return responseJson;
}

/**
 * Authoritatively queries the status of a payment session directly from the MysticPayments API.
 * Useful for real-time reconciliation and fallback verification.
 */
export async function getMysticPaymentStatus(paymentId: string): Promise<any | null> {
  if (!paymentId || typeof paymentId !== "string") return null;

  try {
    const config = getStrictMysticConfig();
    const cleanPaymentId = paymentId.trim();

    const headers: Record<string, string> = {
      "X-Merchant-Id": config.merchantId,
    };
    if (config.apiKey) {
      headers["X-Merchant-Key"] = config.apiKey;
    }

    const res = await fetch(`${config.apiUrl}/api/v1/payments/${encodeURIComponent(cleanPaymentId)}`, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (!res.ok) {
      return null;
    }

    return await res.json();
  } catch (error) {
    console.error("[getMysticPaymentStatus error]:", error);
    return null;
  }
}

/**
 * Authoritatively verifies the HMAC-SHA256 signature delivered with MysticPayments webhooks.
 * Uses timingSafeEqual to strictly protect against side-channel timing attacks.
 */
export function verifyMysticSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  customSecret?: string
): boolean {
  if (!rawBody || typeof rawBody !== "string") return false;
  if (!signatureHeader || typeof signatureHeader !== "string") return false;

  const secret = (
    customSecret ||
    process.env.MYSTIC_PAYMENTS_WEBHOOK_SECRET ||
    process.env.YOUPI_WEBHOOK_SECRET ||
    ""
  ).trim();

  if (!secret) return false;

  // Signatures arrive either as `sha256=<hex>` or raw `<hex>`
  const cleanHeader = signatureHeader.trim();
  const hexPart = cleanHeader.startsWith("sha256=")
    ? cleanHeader.slice(7).trim()
    : cleanHeader;

  // Hex SHA256 must be exactly 64 characters
  if (!/^[0-9a-f]{64}$/i.test(hexPart)) {
    return false;
  }

  const expectedHex = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  try {
    const receivedBuffer = Buffer.from(hexPart.toLowerCase(), "utf8");
    const expectedBuffer = Buffer.from(expectedHex.toLowerCase(), "utf8");

    if (receivedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}
