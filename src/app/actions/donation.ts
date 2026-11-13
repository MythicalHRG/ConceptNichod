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

function calculateTier(totalAmount: number): "Supporter" | "Patron" | "Benefactor" | "Legend" {
  if (totalAmount >= 2500) return "Legend";
  if (totalAmount >= 1000) return "Benefactor";
  if (totalAmount >= 500) return "Patron";
  return "Supporter";
}

/** Public donation settings, approved donor leaderboard, and approved activity only. */
export async function getDonationInfoAction() {
  await dbConnect();
  let setting = await DonationSetting.findOne().lean();
  if (!setting) {
    setting = await DonationSetting.create({
      upiId: "harsh.2525@ptaxis",
      qrCodeUrl: "/qr.png",
      customInstructions: "Scan the QR code using Google Pay, PhonePe, Paytm, or BHIM UPI. Submit your UTR for manual review.",
      thankYouNote: "Thank you for empowering free, high-quality, concept-first education for every student."
    });
  }

  const donors = await Donor.find({ isPublic: true })
    .select("-uuid -userUuid")
    .sort({ totalAmount: -1, amount: -1, lastDonatedAt: -1, createdAt: -1 })
    .lean();

  const recentTransactions = await DonationTransaction.find({ status: "approved", isPublic: true })
    .select("-utr -userUuid -uuid")
    .sort({ reviewedAt: -1, donatedAt: -1 })
    .limit(10)
    .lean();

  return {
    success: true,
    settings: JSON.parse(JSON.stringify(setting)),
    donors: JSON.parse(JSON.stringify(donors)),
    recentTransactions: JSON.parse(JSON.stringify(recentTransactions)),
  };
}

/** Submit a claim for manual review. This action never credits a donor or publishes a transaction. */
export async function submitDonationUtrAction(payload: { amount: number; utr: string; message?: string }) {
  const numericAmount = Number(payload?.amount);
  if (!Number.isSafeInteger(numericAmount) || numericAmount < 1) {
    return { success: false, error: "Please enter a valid whole-number amount of at least ₹1." };
  }

  const rawSession = cookies().get("user_session")?.value;
  const sessionUuid = verifySessionCookie(rawSession);
  if (!sessionUuid) {
    return { success: false, error: "Authentication required. Please log in to submit a donation." };
  }

  await dbConnect();
  const user = await User.findOne({ uuid: sessionUuid }).select("username").lean();
  if (!user) return { success: false, error: "Authenticated user account not found. Please log in again." };

  const authenticatedUsername = user.username.trim().replace(/^@+/, "");
  const rawUtr = String(payload?.utr || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{12}$/.test(rawUtr)) {
    return { success: false, error: "Enter the 12-character UPI reference number shown on your payment receipt." };
  }

  try {
    const transaction = await DonationTransaction.create({
      uuid: crypto.randomUUID(),
      utr: rawUtr,
      username: authenticatedUsername,
      userUuid: sessionUuid,
      amount: numericAmount,
      message: payload.message?.trim() || "ConceptNichod Patron Support",
      donatedAt: new Date(),
      status: "pending",
      isPublic: false,
    });
    return {
      success: true,
      pending: true,
      transactionId: transaction.uuid,
      message: "UTR submitted. Your donation is pending manual review and has not yet been credited."
    };
  } catch (err: any) {
    if (err?.code === 11000 || String(err?.message || "").includes("duplicate key")) {
      return { success: false, error: "This UTR has already been submitted. Duplicate submissions cannot be accepted." };
    }
    console.error("[submitDonationUtrAction]", err);
    return { success: false, error: "Could not submit the donation for review. Please try again." };
  }
}

/** Admin-only queue. UTR is exposed only to the authenticated administrator. */
export async function getPendingDonationsAction() {
  await verifyAdmin();
  const items = await DonationTransaction.find({ status: "pending" })
    .select("uuid utr username userUuid amount message donatedAt status")
    .sort({ donatedAt: 1 })
    .limit(200)
    .lean();
  return { success: true, donations: JSON.parse(JSON.stringify(items)) };
}

/** Approve only after independently checking the bank/UPI statement. */
export async function approveDonationAction(payload: {
  uuid: string;
  confirmedAmount: number;
  recipientConfirmed: boolean;
}) {
  const admin = await verifyAdmin();
  const confirmedAmount = Number(payload?.confirmedAmount);
  if (!payload?.uuid || !Number.isSafeInteger(confirmedAmount) || confirmedAmount < 1 || payload.recipientConfirmed !== true) {
    return { success: false, error: "Confirm the exact received amount and correct recipient before approval." };
  }

  const tx = await DonationTransaction.findOne({ uuid: payload.uuid, status: "pending" });
  if (!tx) return { success: false, error: "This claim is no longer pending. Refresh the review queue." };
  if (confirmedAmount !== tx.amount) {
    return { success: false, error: "The bank-confirmed amount does not match the claimed amount. Reject or investigate the claim instead." };
  }

  tx.status = "approved";
  tx.isPublic = true;
  tx.reviewedAt = new Date();
  tx.reviewedBy = admin.username;
  tx.confirmedAmount = confirmedAmount;
  tx.recipientConfirmed = true;
  await tx.save();

  const approvedTxs = await DonationTransaction.find({ userUuid: tx.userUuid, status: "approved" })
    .select("amount donatedAt message")
    .lean();
  const totalAmount = approvedTxs.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const donationCount = approvedTxs.length;
  const latest = approvedTxs.sort((a, b) => new Date(b.donatedAt).getTime() - new Date(a.donatedAt).getTime())[0];
  const latestMessage = latest?.message || "Proud supporter of ConceptNichod";

  const donor = await Donor.findOneAndUpdate(
    { userUuid: tx.userUuid },
    {
      $set: {
        username: tx.username,
        userUuid: tx.userUuid,
        totalAmount,
        amount: totalAmount,
        donationCount,
        tier: calculateTier(totalAmount),
        latestMessage,
        message: latestMessage,
        lastDonatedAt: latest?.donatedAt || new Date(),
        donatedAt: latest?.donatedAt || new Date(),
        isPublic: true,
      },
      $setOnInsert: { uuid: crypto.randomUUID() }
    },
    { upsert: true, new: true }
  ).lean();

  return { success: true, donor: JSON.parse(JSON.stringify(donor)), message: "Donation approved and credited." };
}

/** Reject a pending claim without crediting or publishing it. */
export async function rejectDonationAction(payload: { uuid: string; reason?: string }) {
  const admin = await verifyAdmin();
  if (!payload?.uuid) return { success: false, error: "Donation reference is required." };
  const result = await DonationTransaction.updateOne(
    { uuid: payload.uuid, status: "pending" },
    {
      $set: {
        status: "rejected",
        isPublic: false,
        reviewedAt: new Date(),
        reviewedBy: admin.username,
        rejectionReason: String(payload.reason || "Could not verify payment").trim().slice(0, 300),
      }
    }
  );
  if (result.modifiedCount !== 1) return { success: false, error: "This claim is no longer pending. Refresh the review queue." };
  return { success: true };
}

export async function getCurrentUserDonationContextAction() {
  try {
    const rawSession = cookies().get("user_session")?.value;
    const sessionUuid = verifySessionCookie(rawSession);
    if (!sessionUuid) return { success: false, username: null };
    await dbConnect();
    const user = await User.findOne({ uuid: sessionUuid }).select("username fullName").lean();
    if (!user) return { success: false, username: null };
    return { success: true, username: user.username, name: user.fullName || user.username };
  } catch {
    return { success: false, username: null };
  }
}

export async function updateDonationSettingsAction(payload: {
  upiId: string; qrCodeUrl?: string; customInstructions?: string; thankYouNote?: string;
}) {
  await verifyAdmin();
  const upiId = String(payload?.upiId || "").trim();
  if (!/^[A-Za-z0-9._-]{2,256}@[A-Za-z0-9.-]{2,64}$/.test(upiId)) {
    throw new Error("Enter a valid UPI ID / VPA.");
  }
  let setting = await DonationSetting.findOne();
  if (!setting) setting = new DonationSetting({ upiId });
  else {
    setting.upiId = upiId;
    if (payload.qrCodeUrl !== undefined) setting.qrCodeUrl = payload.qrCodeUrl?.trim() ?? setting.qrCodeUrl;
    if (payload.customInstructions !== undefined) setting.customInstructions = payload.customInstructions?.trim() || setting.customInstructions;
    if (payload.thankYouNote !== undefined) setting.thankYouNote = payload.thankYouNote.trim();
    setting.updatedAt = new Date();
  }
  await setting.save();
  return { success: true, settings: JSON.parse(JSON.stringify(setting)) };
}

export async function addDonorCardAction(payload: {
  username: string; amount: number; tier?: "Supporter" | "Patron" | "Benefactor" | "Legend"; message?: string;
}) {
  await verifyAdmin();
  const cleanUsername = payload.username.trim().replace(/^@/, "");
  if (!cleanUsername) throw new Error("Username is required");
  if (!Number.isSafeInteger(Number(payload.amount)) || Number(payload.amount) <= 0) throw new Error("A valid donation amount is required");
  const amount = Number(payload.amount);
  const donor = await Donor.create({
    uuid: crypto.randomUUID(), username: cleanUsername, amount, totalAmount: amount,
    donationCount: 1, tier: payload.tier || calculateTier(amount),
    message: payload.message?.trim() || "Proud supporter of ConceptNichod",
    latestMessage: payload.message?.trim() || "Proud supporter of ConceptNichod",
    donatedAt: new Date(), lastDonatedAt: new Date(), isPublic: true,
  });
  return { success: true, donor: JSON.parse(JSON.stringify(donor)) };
}

export async function deleteDonorCardAction(uuid: string) {
  await verifyAdmin();
  await Donor.deleteOne({ uuid });
  return { success: true };
}
