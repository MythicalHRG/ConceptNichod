"use server";

import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import DonationSetting from "@/models/DonationSetting";
import Donor from "@/models/Donor";
import { verifySessionCookie } from "@/lib/session";
import { createMysticSession, cleanAndValidateUrl, getMysticPaymentStatus } from "@/lib/mystic-payments";
import crypto from "crypto";

const ADMIN_USERNAME = "mythicalhrg";

async function verifyAdmin() {
  await dbConnect();
  const rawSession = cookies().get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) throw new Error("Not authenticated");

  const user = await User.findOne({ uuid: sessionUuid });
  if (!user || user.username !== ADMIN_USERNAME) {
    throw new Error("Forbidden: Admin access only");
  }

  return user;
}

/**
 * Public action to retrieve donation settings and public donor cards
 */
export async function getDonationInfoAction() {
  await dbConnect();

  let setting = await DonationSetting.findOne().lean();
  if (!setting) {
    setting = await DonationSetting.create({
      upiId: "harsh.2525@ptaxis",
      qrCodeUrl: "/qr.png",
      customInstructions: "Scan the QR code using Google Pay, PhonePe, Paytm, or BHIM UPI. Mention your username in the transaction notes so we can celebrate your support!",
      thankYouNote: "Thank you for empowering free, high-quality, concept-first education for every student."
    });
  }

  const donors = await Donor.find({ isPublic: true })
    .sort({ amount: -1, createdAt: -1 })
    .lean();

  return {
    success: true,
    settings: JSON.parse(JSON.stringify(setting)),
    donors: JSON.parse(JSON.stringify(donors)),
  };
}

/**
 * Admin action to update UPI ID, QR code URL, and custom instructions
 */
export async function updateDonationSettingsAction(payload: {
  upiId: string;
  qrCodeUrl: string;
  customInstructions: string;
  thankYouNote?: string;
}) {
  await verifyAdmin();

  let setting = await DonationSetting.findOne();
  if (!setting) {
    setting = new DonationSetting(payload);
  } else {
    setting.upiId = payload.upiId?.trim() || setting.upiId;
    setting.qrCodeUrl = payload.qrCodeUrl?.trim() ?? setting.qrCodeUrl;
    setting.customInstructions = payload.customInstructions?.trim() || setting.customInstructions;
    if (payload.thankYouNote) {
      setting.thankYouNote = payload.thankYouNote.trim();
    }
    setting.updatedAt = new Date();
  }

  await setting.save();
  return { success: true, settings: JSON.parse(JSON.stringify(setting)) };
}

/**
 * Admin action to add a donor card manually (username, amount, tier, note)
 */
export async function addDonorCardAction(payload: {
  username: string;
  amount: number;
  tier?: "Supporter" | "Patron" | "Benefactor" | "Legend";
  message?: string;
}) {
  await verifyAdmin();

  const cleanUsername = payload.username.trim().replace(/^@/, "");
  if (!cleanUsername) throw new Error("Username is required");
  if (!payload.amount || payload.amount <= 0) throw new Error("A valid donation amount is required");

  // Determine tier automatically if not provided
  let tier = payload.tier;
  if (!tier) {
    if (payload.amount >= 2500) tier = "Legend";
    else if (payload.amount >= 1000) tier = "Benefactor";
    else if (payload.amount >= 500) tier = "Patron";
    else tier = "Supporter";
  }

  const donor = await Donor.create({
    uuid: crypto.randomUUID(),
    username: cleanUsername,
    amount: Number(payload.amount),
    tier,
    message: payload.message?.trim() || "Proud supporter of ConceptNichod",
    donatedAt: new Date(),
    isPublic: true,
  });

  return { success: true, donor: JSON.parse(JSON.stringify(donor)) };
}

/**
 * Admin action to delete a donor card
 */
export async function deleteDonorCardAction(uuid: string) {
  await verifyAdmin();
  await Donor.deleteOne({ uuid });
  return { success: true };
}

/**
 * Public action to initiate an authoritative MysticPayments checkout session.
 * Requires user authentication to prevent anonymous impersonation and guarantee
 * authentic placement on the Hall of Patrons.
 */
export async function createDonationCheckoutAction(payload: {
  amount: number;
  username?: string;
  message?: string;
}) {
  const numericAmount = Number(payload.amount);
  if (!Number.isFinite(numericAmount) || numericAmount < 1) {
    return { success: false, error: "Please enter a valid amount of at least ₹1." };
  }

  // Authoritatively verify the caller's session
  const rawSession = cookies().get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) {
    return { success: false, error: "Authentication required to initiate donation." };
  }

  await dbConnect();
  const user = await User.findOne({ uuid: sessionUuid }).select("username fullName").lean();
  if (!user) {
    return { success: false, error: "Authenticated user account not found. Please log in again." };
  }

  const authenticatedUsername = user.username.trim().replace(/^@+/, "");
  const orderId = `cn_ord_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  try {
    const session = await createMysticSession({
      orderId,
      amount: numericAmount,
      currency: "INR",
      customer: {
        name: user.fullName || authenticatedUsername,
      },
      metadata: {
        username: authenticatedUsername,
        userUuid: sessionUuid,
        message: payload.message?.trim() || "ConceptNichod Patron Support",
      },
    });

    const cleanCheckoutUrl = cleanAndValidateUrl(session.checkoutUrl);

    return {
      success: true,
      checkoutUrl: cleanCheckoutUrl,
      orderId: session.orderId,
      paymentId: session.paymentId,
    };
  } catch (error: any) {
    console.error("[createDonationCheckoutAction error]:", error);
    return {
      success: false,
      error: error?.message || "Failed to initialize MysticPayments checkout session.",
    };
  }
}

/**
 * Public action to check if current visitor is logged in and retrieve their handle
 */
export async function getCurrentUserDonationContextAction() {
  try {
    const rawSession = cookies().get("user_session")?.value;
    const sessionUuid = verifySessionCookie(rawSession);
    if (!sessionUuid) return { success: false, username: null };

    await dbConnect();
    const user = await User.findOne({ uuid: sessionUuid }).select("username fullName").lean();
    if (!user) return { success: false, username: null };

    return {
      success: true,
      username: user.username,
      name: user.fullName || user.username,
    };
  } catch {
    return { success: false, username: null };
  }
}

/**
 * Public action to check if an order's donation has been confirmed in the Hall of Patrons.
 * Includes authoritative gateway reconciliation fallback if the webhook has not delivered yet.
 */
export async function checkDonationStatusAction(orderId: string, paymentId?: string) {
  if (!orderId || typeof orderId !== "string") {
    return { success: false, error: "Order ID is required" };
  }

  try {
    await dbConnect();
    const cleanOrderId = orderId.trim();
    let donor = await Donor.findOne({ uuid: `mp_${cleanOrderId}` }).lean();

    if (donor) {
      return {
        success: true,
        isConfirmed: true,
        donor: JSON.parse(JSON.stringify(donor)),
      };
    }

    // Fallback reconciliation directly from MysticPayments API if paymentId is known
    if (paymentId && typeof paymentId === "string") {
      const paymentData = await getMysticPaymentStatus(paymentId.trim());
      const isCompleted =
        paymentData?.status === "SUCCESS" ||
        paymentData?.status === "COMPLETED" ||
        paymentData?.status === "OBSERVED_SUCCESS";

      if (isCompleted) {
        const numAmt = Math.max(1, Math.round(Number(paymentData.amount) || 100));
        let tier: "Supporter" | "Patron" | "Benefactor" | "Legend" = "Supporter";
        if (numAmt >= 2500) tier = "Legend";
        else if (numAmt >= 1000) tier = "Benefactor";
        else if (numAmt >= 500) tier = "Patron";

        const donorUsername = (
          paymentData.metadata?.username ||
          paymentData.customer?.name ||
          "Generous Patron"
        ).toString().trim().replace(/^@+/, "") || "Generous Patron";

        donor = await Donor.findOneAndUpdate(
          { uuid: `mp_${cleanOrderId}` },
          {
            $setOnInsert: {
              uuid: `mp_${cleanOrderId}`,
              username: donorUsername,
              amount: numAmt,
              tier,
              message: paymentData.metadata?.message || `Supported via MysticPayments (Payment ID: ${paymentData.paymentId || paymentId})`,
              isPublic: true,
              donatedAt: new Date(),
            },
          },
          { upsert: true, new: true }
        ).lean();

        if (donor) {
          return {
            success: true,
            isConfirmed: true,
            donor: JSON.parse(JSON.stringify(donor)),
          };
        }
      }
    }

    return {
      success: true,
      isConfirmed: false,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || "Failed to query donation status",
    };
  }
}

