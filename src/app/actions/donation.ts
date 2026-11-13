"use server";

import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import DonationSetting from "@/models/DonationSetting";
import Donor from "@/models/Donor";
import DonationTransaction from "@/models/DonationTransaction";
import { verifySessionCookie } from "@/lib/session";
import crypto from "crypto";
import { parseDonationAmount, normalizeUpiReference, normalizeVpa } from "@/lib/donation-validation";

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

  // Build public totals exclusively from independently bank-reconciled transactions.
  // Historical records without verifiedAmount are intentionally excluded.
  const verifiedDonations = await DonationTransaction.aggregate([
    { $match: { status: "verified", verifiedAmount: { $gt: 0 } } },
    { $group: {
      _id: "$userUuid",
      username: { $last: "$username" },
      totalAmount: { $sum: "$verifiedAmount" },
      donationCount: { $sum: 1 },
      lastDonatedAt: { $max: "$verifiedAt" },
      latestMessage: { $last: "$message" }
    } },
    { $sort: { totalAmount: -1, lastDonatedAt: -1 } }
  ]);
  const donors = verifiedDonations.map((d: any) => ({
    uuid: crypto.createHash("sha256").update(String(d._id)).digest("hex").slice(0, 16),
    username: d.username,
    totalAmount: d.totalAmount,
    amount: d.totalAmount,
    donationCount: d.donationCount,
    tier: d.totalAmount >= 2500 ? "Legend" : d.totalAmount >= 1000 ? "Benefactor" : d.totalAmount >= 500 ? "Patron" : "Supporter",
    latestMessage: d.latestMessage || "",
    message: d.latestMessage || "",
    lastDonatedAt: d.lastDonatedAt,
    donatedAt: d.lastDonatedAt,
  }));

  // Retrieve latest 10 verified transactions for the recent activity ticker
  // Security Hardening: Redact sensitive 12-digit bank UTR numbers and internal UUIDs from public feed
  const recentTransactions = await DonationTransaction.find({ isPublic: true, status: "verified" })
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
/**
 * Submit a UPI reference for review. A UTR and client-provided amount are claims,
 * not proof of settlement. This action never credits a donor or marks a payment verified.
 */
export async function submitDonationUtrAction(payload: {
  amount: number;
  utr: string;
  message?: string;
}) {
  const amount = parseDonationAmount(payload?.amount);
  if (amount === null) {
    return { success: false, error: "Enter a valid donation amount between ₹1 and ₹10,00,000 (up to 2 decimal places)." };
  }

  const sessionUuid = verifySessionCookie(cookies().get("user_session")?.value);
  if (!sessionUuid) {
    return { success: false, error: "Authentication required. Please log in to submit a donation." };
  }

  const rawUtr = normalizeUpiReference(payload?.utr);
  if (!rawUtr) {
    return { success: false, error: "Enter the transaction reference exactly as shown on your UPI receipt (8–20 letters or digits)." };
  }

  await dbConnect();
  const [user, setting, existing] = await Promise.all([
    User.findOne({ uuid: sessionUuid }).select("username").lean(),
    DonationSetting.findOne().select("upiId").lean(),
    DonationTransaction.findOne({ utr: rawUtr }).select("_id").lean(),
  ]);
  if (!user) return { success: false, error: "Account not found. Please sign in again." };
  if (!setting?.upiId) return { success: false, error: "The donation recipient is not configured. Please contact the administrator." };
  if (existing) return { success: false, error: "This transaction reference has already been submitted." };

  const configuredVpa = normalizeVpa(setting.upiId);
  if (!configuredVpa) {
    return { success: false, error: "The configured donation UPI ID is invalid. Please contact the administrator." };
  }

  try {
    const tx = await DonationTransaction.create({
      uuid: crypto.randomUUID(),
      utr: rawUtr,
      username: user.username.trim().replace(/^@+/, ""),
      userUuid: sessionUuid,
      amount,
      message: String(payload.message || "").trim().slice(0, 500),
      donatedAt: new Date(),
      isPublic: false,
      status: "pending",
      recipientVpa: configuredVpa,
    });
    return {
      success: true,
      status: "pending" as const,
      reference: tx.utr,
      message: "Your transaction reference was submitted for manual bank reconciliation. It has not been verified or added to the Hall of Patrons yet.",
    };
  } catch (err: any) {
    if (err?.code === 11000 || String(err?.message || "").includes("duplicate key")) {
      return { success: false, error: "This transaction reference has already been submitted." };
    }
    console.error("[donation submission]", err);
    return { success: false, error: "Could not submit the transaction reference. Please try again." };
  }
}

/**
 * Admin-only manual reconciliation. The administrator must compare the UTR,
 * exact credited amount, and recipient against the bank's own transaction record.
 */
export async function reconcileDonationManuallyAction(payload: {
  utr: string;
  receivedAmount: number;
  recipientVpa: string;
}) {
  const admin = await verifyAdmin();
  const utr = String(payload?.utr || "").trim().toUpperCase();
  const receivedAmount = parseDonationAmount(payload?.receivedAmount);
  const recipientVpa = normalizeVpa(payload?.recipientVpa);
  if (!normalizeUpiReference(utr)) throw new Error("Invalid transaction reference.");
  if (receivedAmount === null) {
    throw new Error("Enter the actual credited amount from the bank record.");
  }
  if (!recipientVpa) {
    throw new Error("Enter a valid recipient UPI ID from the bank record.");
  }

  await dbConnect();
  const pending = await DonationTransaction.findOne({ utr, status: "pending" });
  if (!pending) throw new Error("No pending donation was found for this reference.");
  // Compare against the recipient captured when the payment intent was generated,
  // not a possibly changed admin setting.
  const expectedVpa = normalizeVpa(pending.recipientVpa);
  if (!expectedVpa || recipientVpa !== expectedVpa) {
    throw new Error("Recipient mismatch: the bank-record recipient does not match the UPI ID shown when this donation was submitted.");
  }
  if (Math.round(Number(pending.amount) * 100) !== Math.round(receivedAmount * 100)) {
    throw new Error(`Amount mismatch: submitted ₹${pending.amount}; bank credited ₹${receivedAmount}. This donation remains pending for investigation.`);
  }

  const verified = await DonationTransaction.findOneAndUpdate(
    { _id: pending._id, status: "pending" },
    { $set: {
      status: "verified",
      verifiedAmount: receivedAmount,
      recipientVpa,
      verificationMethod: "manual-bank-reconciliation",
      verifiedAt: new Date(),
      verifiedBy: admin.username,
      isPublic: true,
    } },
    { new: true }
  );
  if (!verified) throw new Error("This transaction was already processed by another request.");

  const verifiedTransactions = await DonationTransaction.find({ userUuid: verified.userUuid, status: "verified" }).select("verifiedAmount").lean();
  const totalAmount = verifiedTransactions.reduce((sum: number, tx: any) => sum + Number(tx.verifiedAmount || 0), 0);
  const donationCount = verifiedTransactions.length;
  const tier = totalAmount >= 2500 ? "Legend" : totalAmount >= 1000 ? "Benefactor" : totalAmount >= 500 ? "Patron" : "Supporter";
  await Donor.findOneAndUpdate(
    { userUuid: verified.userUuid },
    { $set: {
      username: verified.username,
      userUuid: verified.userUuid,
      totalAmount,
      amount: totalAmount,
      donationCount,
      tier,
      latestMessage: verified.message || "Proud supporter of ConceptNichod",
      message: verified.message || "Proud supporter of ConceptNichod",
      lastDonatedAt: new Date(),
      donatedAt: new Date(),
      isPublic: true,
    }, $setOnInsert: { uuid: crypto.randomUUID() } },
    { upsert: true, new: true }
  );
  return { success: true, message: "Bank-reconciled donation marked verified.", verifiedAmount: receivedAmount, totalAmount, donationCount };
}


/** Admin-only queue of unverified UTR claims. */
export async function getPendingDonationsAdminAction() {
  await verifyAdmin();
  await dbConnect();
  const pending = await DonationTransaction.find({ status: "pending" })
    .select("utr username amount message donatedAt")
    .sort({ donatedAt: 1 })
    .limit(200)
    .lean();
  return pending.map((tx: any) => ({
    utr: tx.utr,
    username: tx.username,
    claimedAmount: tx.amount,
    message: tx.message || "",
    submittedAt: new Date(tx.donatedAt).toISOString(),
  }));
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
    const nextVpa = normalizeVpa(payload.upiId || setting?.upiId);
  if (!nextVpa) throw new Error("Enter a valid UPI ID in name@bank format.");
  setting.upiId = nextVpa;
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
