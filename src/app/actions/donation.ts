"use server";

import { cookies } from "next/headers";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";
import DonationSetting from "@/models/DonationSetting";
import Donor from "@/models/Donor";
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
    if (payload.amount >= 2000) tier = "Legend";
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
