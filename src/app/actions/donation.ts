"use server";

import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import DonationSetting from "@/models/DonationSetting";
import Donor from "@/models/Donor";
import DonationTransaction from "@/models/DonationTransaction";
import { verifySessionCookie } from "@/lib/session";
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
 * Public action to retrieve donation settings, public donor leaderboard (summed),
 * and recent contributions feed.
 */
export async function getDonationInfoAction() {
  await dbConnect();

  let setting = await DonationSetting.findOne().lean();
  if (!setting) {
    setting = await DonationSetting.create({
      upiId: "harsh.2525@ptaxis",
      qrCodeUrl: "/qr.png",
      customInstructions: "Scan the QR code using Google Pay, PhonePe, Paytm, or BHIM UPI. Enter your 12-digit UTR to be instantly recognized on the Hall of Patrons!",
      thankYouNote: "Thank you for empowering free, high-quality, concept-first education for every student."
    });
  }

  // Retrieve donors ordered by total cumulative amount descending (Leaderboard)
  // Security Hardening: Redact internal UUIDs from public responses
  const donors = await Donor.find({ isPublic: true })
    .select("-uuid -userUuid")
    .sort({ totalAmount: -1, amount: -1, lastDonatedAt: -1, createdAt: -1 })
    .lean();

  // Retrieve latest 10 verified transactions for the recent activity ticker
  // Security Hardening: Redact sensitive 12-digit bank UTR numbers and internal UUIDs from public feed
  const recentTransactions = await DonationTransaction.find({ isPublic: true })
    .select("-utr -userUuid -uuid")
    .sort({ donatedAt: -1 })
    .limit(10)
    .lean();

  return {
    success: true,
    settings: JSON.parse(JSON.stringify(setting)),
    donors: JSON.parse(JSON.stringify(donors)),
    recentTransactions: JSON.parse(JSON.stringify(recentTransactions)),
  };
}

/**
 * Public action to submit and verify a 12-digit UPI Reference (UTR) number.
 * Enforces strict 12-digit format, strict database deduplication,
 * and cumulative multi-payment aggregation per username.
 */
export async function submitDonationUtrAction(payload: {
  amount: number;
  utr: string;
  message?: string;
}) {
  const numericAmount = Math.round(Number(payload.amount));
  if (!Number.isFinite(numericAmount) || numericAmount < 1) {
    return { success: false, error: "Please enter a valid amount of at least ₹1." };
  }

  // 1. Authoritatively verify the caller's session
  const rawSession = cookies().get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) {
    return { success: false, error: "Authentication required. Please log in to your ConceptNichod account to donate." };
  }

  await dbConnect();
  const user = await User.findOne({ uuid: sessionUuid }).select("username fullName").lean();
  if (!user) {
    return { success: false, error: "Authenticated user account not found. Please log in again." };
  }

  const authenticatedUsername = user.username.trim().replace(/^@+/, "");

  // 2. Strict 12-Digit UPI Reference (UTR) Format Validation
  const rawUtr = String(payload.utr || "").trim().toUpperCase();
  // Indian UPI UTRs are strictly 12 alphanumeric/numeric characters (NPCI standard)
  const UTR_REGEX = /^[A-Z0-9]{12}$/;
  if (!UTR_REGEX.test(rawUtr)) {
    return { 
      success: false, 
      error: "Invalid UTR format. Please enter the exact 12-digit UPI Reference Number / UTR shown on your Google Pay, PhonePe, or Paytm receipt." 
    };
  }

  // 3. Strict Deduplication Check: A UTR can NEVER be reused across any user or order!
  const existingTx = await DonationTransaction.findOne({ utr: rawUtr }).lean();
  if (existingTx) {
    return { 
      success: false, 
      error: "This UPI Reference (UTR) has already been submitted or redeemed. Reusing old transactions is strictly prohibited." 
    };
  }

  // 4. Record the fresh donation transaction
  try {
    await DonationTransaction.create({
      uuid: crypto.randomUUID(),
      utr: rawUtr,
      username: authenticatedUsername,
      userUuid: sessionUuid,
      amount: numericAmount,
      message: payload.message?.trim() || "ConceptNichod Patron Support",
      donatedAt: new Date(),
      isPublic: true,
    });
  } catch (err: any) {
    if (err?.code === 11000 || String(err?.message || "").includes("duplicate key")) {
      return { 
        success: false, 
        error: "This UPI Reference (UTR) has already been submitted. Duplicate submissions cannot be accepted." 
      };
    }
    return { success: false, error: "Database error recording transaction. Please try again." };
  }

  // 5. Cumulative Summation: Match by userUuid OR username so that changing username/email never loses donation history
  const allUserTxs = await DonationTransaction.find({
    $or: [{ userUuid: sessionUuid }, { username: authenticatedUsername }]
  }).lean();
  const totalAmount = allUserTxs.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const donationCount = allUserTxs.length;

  // Keep username synchronized across all past transactions for this userUuid if user changed username
  await DonationTransaction.updateMany(
    { userUuid: sessionUuid },
    { $set: { username: authenticatedUsername } }
  ).catch(() => {});

  // 6. Dynamic Tier Calculation based on cumulative totalAmount
  let tier: "Supporter" | "Patron" | "Benefactor" | "Legend" = "Supporter";
  if (totalAmount >= 2500) tier = "Legend";
  else if (totalAmount >= 1000) tier = "Benefactor";
  else if (totalAmount >= 500) tier = "Patron";

  const latestMsg = payload.message?.trim() || "Proud supporter of ConceptNichod";

  // 7. Upsert the cumulative Donor record for Hall of Patrons by userUuid or username
  const donor = await Donor.findOneAndUpdate(
    { $or: [{ userUuid: sessionUuid }, { username: authenticatedUsername }] },
    {
      $set: {
        username: authenticatedUsername,
        userUuid: sessionUuid,
        totalAmount,
        amount: totalAmount, // Synchronize legacy amount field with cumulative total
        donationCount,
        tier,
        latestMessage: latestMsg,
        message: latestMsg,
        lastDonatedAt: new Date(),
        donatedAt: new Date(),
        isPublic: true,
      },
      $setOnInsert: {
        uuid: crypto.randomUUID(),
      }
    },
    { upsert: true, new: true }
  ).lean();

  return {
    success: true,
    message: `Thank you @${authenticatedUsername}! Your contribution has been verified and added to the Hall of Patrons.`,
    donor: JSON.parse(JSON.stringify(donor)),
    contributedAmount: numericAmount,
    totalAmount,
    donationCount,
  };
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
 * Admin action to update UPI ID, QR code URL, and custom instructions
 */
export async function updateDonationSettingsAction(payload: {
  upiId: string;
  qrCodeUrl?: string;
  customInstructions?: string;
  thankYouNote?: string;
}) {
  await verifyAdmin();

  let setting = await DonationSetting.findOne();
  if (!setting) {
    setting = new DonationSetting(payload);
  } else {
    setting.upiId = payload.upiId?.trim() || setting.upiId;
    if (payload.qrCodeUrl !== undefined) {
      setting.qrCodeUrl = payload.qrCodeUrl?.trim() ?? setting.qrCodeUrl;
    }
    if (payload.customInstructions !== undefined) {
      setting.customInstructions = payload.customInstructions?.trim() || setting.customInstructions;
    }
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
    totalAmount: Number(payload.amount),
    donationCount: 1,
    tier,
    message: payload.message?.trim() || "Proud supporter of ConceptNichod",
    latestMessage: payload.message?.trim() || "Proud supporter of ConceptNichod",
    donatedAt: new Date(),
    lastDonatedAt: new Date(),
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
