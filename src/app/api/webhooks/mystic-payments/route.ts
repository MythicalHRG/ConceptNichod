import { NextRequest, NextResponse } from "next/server";
import { verifyMysticSignature, getStrictMysticConfig } from "@/lib/mystic-payments";
import dbConnect from "@/lib/mongoose";
import Donor from "@/models/Donor";

export const dynamic = "force-dynamic";

/**
 * Authoritative Webhook Receiver for MysticPayments Gateway.
 * Validates cryptographic HMAC signatures before persisting payment settlement.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signatureHeader =
      req.headers.get("x-signature-sha256") ||
      req.headers.get("x-mystic-signature") ||
      req.headers.get("x-mysticpayments-signature") ||
      req.headers.get("x-youpi-signature") ||
      req.headers.get("x-webhook-signature");

    const config = getStrictMysticConfig();
    const isValid = verifyMysticSignature(rawBody, signatureHeader, config.webhookSecret);

    if (!isValid) {
      console.warn("[MysticPayments Webhook] Signature verification failed or missing.");
      return NextResponse.json(
        { error: "Unauthorized: Invalid cryptographic signature" },
        { status: 401 }
      );
    }

    const payload = JSON.parse(rawBody);
    const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
    const event = payload?.event || data?.event;
    const paymentId = data?.paymentId || data?.payment_id || payload?.paymentId;
    const orderId = data?.orderId || data?.order_id || payload?.orderId;
    const amount = data?.amount !== undefined ? data.amount : payload?.amount;
    const status = data?.status || payload?.status;
    const customer = data?.customer || payload?.customer;
    const metadata = data?.metadata || payload?.metadata;

    console.log(`[MysticPayments Webhook] Received valid event: ${event || status} for order ${orderId}`);

    // If payment is successful or verified
    const isSuccess =
      status === "SUCCESS" ||
      status === "COMPLETED" ||
      status === "OBSERVED_SUCCESS" ||
      event === "SUCCESS" ||
      event === "payment.succeeded" ||
      event === "payment.observed";

    if (isSuccess && orderId) {
      await dbConnect();

      const rawUsername = (
        customer?.name ||
        metadata?.username ||
        customer?.email?.split("@")[0] ||
        "Generous Patron"
      ).toString().trim();

      const donorUsername = rawUsername.replace(/^@+/, "") || "Generous Patron";

      const numericAmount = Math.max(1, Math.round(Number(amount) || 100));

      // Calculate tier based on amount
      let tier: "Supporter" | "Patron" | "Benefactor" | "Legend" = "Supporter";
      if (numericAmount >= 2500) tier = "Legend";
      else if (numericAmount >= 1000) tier = "Benefactor";
      else if (numericAmount >= 500) tier = "Patron";

      // Idempotently create or update donor record
      await Donor.findOneAndUpdate(
        { uuid: `mp_${orderId}` },
        {
          $setOnInsert: {
            uuid: `mp_${orderId}`,
            username: donorUsername,
            amount: numericAmount,
            tier,
            message: metadata?.message || `Supported via MysticPayments (Payment ID: ${paymentId || orderId})`,
            isPublic: true,
            donatedAt: new Date(),
          },
        },
        { upsert: true, new: true }
      );
    }

    return NextResponse.json({
      received: true,
      orderId,
      gateway: "MysticPayments",
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[MysticPayments Webhook Error]:", error);
    return NextResponse.json(
      { error: "Internal Server Error", message: error?.message },
      { status: 500 }
    );
  }
}
