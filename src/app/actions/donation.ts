// src/app/actions/donation.ts
"use server";


import { isPlatformOwner } from "@/lib/owner-access";
import { revalidatePath } from "next/cache";
import connectToDatabase from "@/lib/mongoose";
import DonationTransaction from "@/models/DonationTransaction";
import Donor from "@/models/Donor";
import DonationSetting from "@/models/DonationSetting";
import User from "@/models/User";
import { cookies } from "next/headers";
import { verifySessionCookie } from "@/lib/session";
import crypto from "crypto";
import { getClientIp } from "@/lib/ip";
import { checkDistributedRateLimit } from "@/lib/distributed-rate-limiter";
import {
  validateDonationSubmission,
  validateAdminVerifiedAmount,
  computePatronTier,
  sanitizeDonationText,
  normalizeVpa,
  PatronTier,
} from "@/lib/donation-validation";

const VALID_TIERS: PatronTier[] = ["LEGEND", "DIAMOND", "GOLD", "SILVER", "SUPPORTER"];
const DONATIONS_ENABLED = process.env.DONATIONS_ENABLED === "true";

async function requireOwnerSession() {
  await connectToDatabase();
  const sessionUuid = verifySessionCookie((await cookies()).get("user_session")?.value);
  if (!sessionUuid) throw new Error("Unauthorized: Please log in as Admin.");
  const adminUser = await User.findOne({ uuid: sessionUuid }).select("uuid username role email").lean();
  if (!isPlatformOwner(adminUser)) throw new Error("Forbidden: Owner privileges required.");
  return adminUser;
}

/**
 * 1. Public Data Loader for /donate (UPI Config + Verified Hall of Patrons)
 */
export async function getPublicDonationPageData() {
  try {
    await connectToDatabase();

    let settings = await DonationSetting.findOne().lean();
    if (!settings) {
      const created = await DonationSetting.create({
        upiId: "",
        payeeName: process.env.NEXT_PUBLIC_UPI_NAME || "ConceptNichod",
        qrCodeUrl: "",
        isEnabled: false,
      });
      settings = created.toObject();
    }

    const configuredVpa = normalizeVpa(settings.upiId || "");
    const donationsAvailable = DONATIONS_ENABLED && Boolean(settings.isEnabled) && Boolean(configuredVpa);

    const [patronsRaw, totalRaisedAgg] = await Promise.all([
      Donor.find({ isVisible: true, isPublic: true, amount: { $gt: 0 } })
        .select("name username amount tier message isAnonymous donatedAt createdAt")
        .sort({ amount: -1, donatedAt: -1 })
        .limit(150)
        .lean(),
      Donor.aggregate([
        { $match: { isVisible: true, isPublic: true, amount: { $gt: 0 } } },
        { $group: { _id: null, totalRaised: { $sum: "$amount" } } },
      ]),
    ]);

    const patrons = patronsRaw.map((p: any) => ({
      id: String(p._id),
      name: p.isAnonymous ? "Anonymous Patron" : p.name,
      username: p.isAnonymous ? null : p.username || null,
      amount: Number(p.amount) || 0,
      tier: (p.tier as PatronTier) || computePatronTier(Number(p.amount) || 0),
      message: p.message || "",
      donatedAt: p.donatedAt
        ? new Date(p.donatedAt).toISOString()
        : new Date(p.createdAt).toISOString(),
    }));

    const totalRaised = Number(totalRaisedAgg[0]?.totalRaised || 0);

    return {
      success: true,
      settings: {
        upiId: donationsAvailable ? configuredVpa || "" : "",
        payeeName: settings.payeeName || "ConceptNichod",
        qrCodeUrl: "",
        isEnabled: donationsAvailable,
        headline:
          settings.headline || "Support ConceptNichod & Join the Hall of Patrons",
        subtext:
          settings.subtext ||
          "Scan the UPI QR code to contribute any amount, then submit your 12-digit UTR and Transaction ID below for manual Admin verification.",
      },
      patrons,
      totalRaised,
      totalPatrons: patrons.length,
    };
  } catch (error) {
    console.error("[getPublicDonationPageData] Error:", error);
    return {
      success: false,
      settings: {
        upiId: process.env.NEXT_PUBLIC_UPI_ID || "",
        payeeName: process.env.NEXT_PUBLIC_UPI_NAME || "ConceptNichod",
        qrCodeUrl: "",
        isEnabled: false,
        headline: "Support ConceptNichod & Join the Hall of Patrons",
        subtext:
          "Scan the UPI QR code to contribute any amount, then submit your 12-digit UTR and Transaction ID below.",
      },
      patrons: [],
      totalRaised: 0,
      totalPatrons: 0,
    };
  }
}

/**
 * 2. Public Action: Submit UTR & Transaction ID from /donate to Admin Panel Queue
 *    Amount is NOT set here — Admin manually checks UTR & enters the amount in the Admin Panel.
 */
export async function submitDonationTransaction(formData: {
  donorName: string;
  utr: string;
  transactionId: string;
  message?: string;
  isAnonymous?: boolean;
  honeypot?: string;
}) {
  try {
    if (formData.honeypot && formData.honeypot.trim() !== "") {
      return { success: true, message: "Your UTR & Transaction ID have been sent to the Admin Panel for verification." };
    }

    if (!DONATIONS_ENABLED) {
      return { success: false, error: "Donations are temporarily unavailable while the recipient account is being confirmed." };
    }

    const validation = validateDonationSubmission(formData);
    if (!validation.valid || !validation.data) {
      return { success: false, error: validation.error || "Invalid submission details." };
    }

    const { donorName, utr, transactionId, message, isAnonymous } = validation.data;
    const clientIp = await getClientIp();

    await connectToDatabase();
    const settings = await DonationSetting.findOne().select("upiId isEnabled").lean();
    const configuredVpa = normalizeVpa((settings as any)?.upiId || "");
    if (!settings?.isEnabled || !configuredVpa) {
      return { success: false, error: "Donations are temporarily unavailable because the recipient account is not configured and enabled." };
    }

    const ipUnavailable = clientIp === "127.0.0.1" || clientIp === "unknown";
    const rateLimitKey = ipUnavailable ? "donate_submit:" + clientIp + ":" + utr : "donate_submit:" + clientIp;
    const rateLimit = await checkDistributedRateLimit(rateLimitKey, 5, 15 * 60 * 1000);
    if (!rateLimit.success) {
      return { success: false, error: "Too many submissions from your network. Please wait 15 minutes before trying again." };
    }

    const existing = await DonationTransaction.findOne({
      $or: [{ utr }, { transactionId }],
    }).select("utr transactionId status").lean();

    if (existing) {
      const dupField = existing.utr === utr ? "12-digit UTR" : "Transaction ID";
      const existingStatus = String(existing.status || "pending").toUpperCase();
      return { success: false, error: "This " + dupField + " has already been submitted (Status: " + existingStatus + ")." };
    }

    const sessionUuid = verifySessionCookie((await cookies()).get("user_session")?.value);
    let userId: string | null = null;
    let username: string | null = null;
    if (sessionUuid) {
      const dbUser = await User.findOne({ uuid: sessionUuid }).select("uuid username").lean();
      if (dbUser) {
        userId = sessionUuid;
        username = (dbUser as any).username || null;
      }
    }

    const createdTx = await DonationTransaction.create({
      uuid: crypto.randomUUID(),
      userId,
      userUuid: userId,
      username,
      donorName,
      isAnonymous: Boolean(isAnonymous),
      utr,
      transactionId,
      message: message || "",
      status: "pending",
      verifiedAmount: null,
      patronTier: null,
      isPublishedToPatrons: false,
      submitterIp: clientIp,
      amount: null,
      claimedAmount: null,
      donatedAt: new Date(),
      isPublic: false,
    });

    revalidatePath("/dashboard/admin");
    revalidatePath("/dashboard/admin/donations");

    return {
      success: true,
      transactionId: String(createdTx._id),
      message: "Submitted! Your UTR and Transaction ID have been sent to the Admin Panel for verification.",
    };
  } catch (error: any) {
    if (error?.code === 11000) {
      return { success: false, error: "This UTR or Transaction ID has already been submitted." };
    }
    console.error("[submitDonationTransaction] Error:", error);
    return { success: false, error: "Failed to submit transaction details. Please try again." };
  }
}

/**
 * 3. Admin Action: Fetch All UTR Submissions, Summary Metrics & Hall of Patrons List
 */
export async function getAdminDonationDashboard(filterStatus?: string, search?: string) {
  try {
    await requireOwnerSession();

    const queryParts: Record<string, any>[] = [];
    if (filterStatus === "pending") {
      // Legacy records created before status tracking must remain reviewable.
      queryParts.push({ $or: [{ status: "pending" }, { status: { $exists: false } }, { status: null }] });
    } else if (filterStatus && ["verified", "rejected"].includes(filterStatus)) {
      queryParts.push({ status: filterStatus });
    }

    if (search && search.trim() !== "") {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");
      queryParts.push({ $or: [
        { utr: regex },
        { transactionId: regex },
        { donorName: regex },
        { username: regex },
      ] });
    }
    const query = queryParts.length === 0 ? {} : queryParts.length === 1 ? queryParts[0] : { $and: queryParts };

    const [transactionsRaw, statsAgg, settingsRaw, patronsRaw, legacyPendingCount] = await Promise.all([
      DonationTransaction.find(query).sort({ createdAt: -1 }).limit(250).lean(),
      DonationTransaction.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            verifiedSum: {
              $sum: {
                $cond: [{ $eq: ["$status", "verified"] }, { $ifNull: ["$verifiedAmount", 0] }, 0],
              },
            },
          },
        },
      ]),
      DonationSetting.findOne().lean(),
      Donor.find().sort({ amount: -1, donatedAt: -1 }).limit(200).lean(),
      DonationTransaction.countDocuments({ $or: [{ status: { $exists: false } }, { status: null }] }),
    ]);

    const summary = {
      pendingCount: 0,
      verifiedCount: 0,
      rejectedCount: 0,
      totalVerifiedAmount: 0,
    };

    summary.pendingCount = legacyPendingCount;
    for (const row of statsAgg) {
      if (row._id === "pending") summary.pendingCount += row.count;
      if (row._id === "verified") {
        summary.verifiedCount = row.count;
        summary.totalVerifiedAmount = row.verifiedSum || 0;
      }
      if (row._id === "rejected") summary.rejectedCount = row.count;
    }

    const transactions = transactionsRaw.map((t: any) => ({
      id: String(t._id),
      userId: t.userId ? String(t.userId) : null,
      username: t.username || null,
      donorName: t.donorName,
      donorEmail: t.donorEmail || null,
      isAnonymous: Boolean(t.isAnonymous),
      utr: t.utr,
      transactionId: t.transactionId || "",
      message: t.message || "",
      status: t.status || "pending",
      verifiedAmount: t.verifiedAmount ?? null,
      patronTier: t.patronTier || null,
      isPublishedToPatrons: Boolean(t.isPublishedToPatrons),
      donorRecordId: t.donorRecordId ? String(t.donorRecordId) : null,
      adminNote: t.adminNote || "",
      verifiedBy: t.verifiedBy || null,
      verifiedAt: t.verifiedAt ? new Date(t.verifiedAt).toISOString() : null,
      createdAt: new Date(t.createdAt || t.donatedAt || Date.now()).toISOString(),
    }));

    const patrons = patronsRaw.map((p: any) => ({
      id: String(p._id),
      name: p.name,
      username: p.username || null,
      amount: Number(p.amount) || 0,
      tier: p.tier || computePatronTier(Number(p.amount) || 0),
      message: p.message || "",
      isAnonymous: Boolean(p.isAnonymous),
      isVisible: Boolean(p.isVisible),
      donatedAt: p.donatedAt
        ? new Date(p.donatedAt).toISOString()
        : new Date(p.createdAt).toISOString(),
    }));

    return {
      success: true,
      summary,
      transactions,
      patrons,
      settings: {
        upiId: (settingsRaw as any)?.upiId || "",
        payeeName: (settingsRaw as any)?.payeeName || "ConceptNichod",
        qrCodeUrl: "",
        isEnabled: Boolean((settingsRaw as any)?.isEnabled) && process.env.DONATIONS_ENABLED === "true",
      },
    };
  } catch (error: any) {
    console.error("[getAdminDonationDashboard] Error:", error);
    return {
      success: false,
      error: error.message || "Failed to load Admin Donation Dashboard.",
    };
  }
}

/**
 * 4. Admin Action: Manually Enter Verified Amount, Mark UTR Verified & Optionally Promote to Hall of Patrons
 */
export async function adminVerifyDonationAndSetAmount(payload: {
  transactionDbId: string;
  verifiedAmount: number | string;
  bankReference: string;
  recipientVpa: string;
  publishToHallOfPatrons: boolean;
  customTier?: string;
  adminNote?: string;
}) {
  try {
    const adminUser = await requireOwnerSession();

    const amountCheck = validateAdminVerifiedAmount(payload.verifiedAmount);
    if (!amountCheck.valid || !amountCheck.data) {
      return {
        success: false,
        error: amountCheck.error || "Please enter a valid verified amount (₹).",
      };
    }

    const confirmedAmount = amountCheck.data;

    let tx = await DonationTransaction.findById(payload.transactionDbId);
    if (!tx) {
      return { success: false, error: "Donation transaction not found." };
    }
    if (tx.status && tx.status !== "pending") {
      return { success: false, error: "This donation has already been reviewed." };
    }

    // An admin-entered amount is not proof of payment. Require explicit bank-record
    // reference and recipient VPA confirmation before changing a transaction to verified.
    const bankReference = sanitizeDonationText(payload.bankReference || "", 60).replace(/\s+/g, "");
    if (!bankReference || bankReference !== String(tx.utr)) {
      return { success: false, error: "Bank statement reference must exactly match the submitted UTR." };
    }
    const settings = await DonationSetting.findOne().select("upiId").lean();
    const configuredVpa = normalizeVpa((settings as any)?.upiId);
    const recipientVpa = normalizeVpa(sanitizeDonationText(payload.recipientVpa || "", 100));
    if (!configuredVpa || !recipientVpa || recipientVpa !== configuredVpa) {
      return { success: false, error: "Recipient VPA must match the configured donation account and the bank record." };
    }

    const tier: PatronTier =
      payload.customTier && VALID_TIERS.includes(payload.customTier as PatronTier)
        ? (payload.customTier as PatronTier)
        : computePatronTier(confirmedAmount);

    // Claim the pending transaction atomically before creating/updating its patron record.
    // Concurrent approval requests cannot both pass this one-way status transition.
    const claimedTx = await DonationTransaction.findOneAndUpdate(
      {
        _id: tx._id,
        $or: [
          { status: "pending" },
          { status: { $exists: false } },
          { status: null },
        ],
      },
      {
        $set: {
          status: "verified",
          bankReference,
          recipientVpa: configuredVpa,
          verificationMethod: "manual-bank-reconciliation",
          verifiedAmount: confirmedAmount,
          patronTier: tier,
          isPublishedToPatrons: Boolean(payload.publishToHallOfPatrons),
          adminNote: sanitizeDonationText(payload.adminNote || "", 500),
          verifiedBy: (adminUser as any).username || "Admin",
          verifiedAt: new Date(),
        },
      },
      { new: true, runValidators: true }
    );
    if (!claimedTx) {
      return { success: false, error: "This donation has already been reviewed or is being processed." };
    }
    tx = claimedTx;

    // Sync with Donor (Hall of Patrons) collection
    if (tx.isPublishedToPatrons) {
      const patronData = {
        uuid: tx.donorRecordId ? undefined : crypto.randomUUID(),
        userId: tx.userId || null,
        userUuid: tx.userId || null,
        username: tx.username || null,
        name: tx.donorName,
        amount: confirmedAmount,
        tier,
        message: tx.message || "",
        isAnonymous: tx.isAnonymous,
        isVisible: true,
        utr: tx.utr,
        transactionId: tx.transactionId || undefined,
        transactionRef: String(tx._id),
        verifiedBy: tx.verifiedBy,
        donatedAt: tx.createdAt || new Date(),
        lastDonatedAt: tx.createdAt || new Date(),
        totalAmount: confirmedAmount,
        donationCount: 1,
        latestMessage: tx.message || "",
        isPublic: true,
      };

      if (tx.donorRecordId) {
        await Donor.findByIdAndUpdate(tx.donorRecordId, patronData, { new: true });
      } else {
        const existingDonor = await Donor.findOne({ transactionRef: String(tx._id) });
        if (existingDonor) {
          Object.assign(existingDonor, patronData);
          await existingDonor.save();
          tx.donorRecordId = String(existingDonor._id);
        } else {
          const newDonor = await Donor.create(patronData);
          tx.donorRecordId = String(newDonor._id);
        }
      }
    } else if (tx.donorRecordId) {
      // If unchecked, hide from Hall of Patrons
      await Donor.findByIdAndUpdate(tx.donorRecordId, { isVisible: false, isPublic: false });
    }

    await tx.save();


    revalidatePath("/donate");
    revalidatePath("/dashboard/admin");
    revalidatePath("/dashboard/admin/donations");

    return {
      success: true,
      message: tx.isPublishedToPatrons
        ? `Verified ₹${confirmedAmount.toLocaleString("en-IN")} and added ${tx.donorName} to the Hall of Patrons!`
        : `Verified ₹${confirmedAmount.toLocaleString("en-IN")} for UTR ${tx.utr}.`,
    };
  } catch (error: any) {
    console.error("[adminVerifyDonationAndSetAmount] Error:", error);
    return {
      success: false,
      error: error.message || "Failed to verify donation.",
    };
  }
}

/**
 * 5. Admin Action: Toggle Hall of Patrons Visibility for an Already Verified Transaction
 */
export async function adminToggleHallOfPatrons(
  transactionDbId: string,
  publish: boolean
) {
  try {
    const adminUser = await requireOwnerSession();

    const tx = await DonationTransaction.findById(transactionDbId);
    if (!tx) {
      return { success: false, error: "Transaction record not found." };
    }

    if (tx.status !== "verified" || !tx.verifiedAmount || tx.verifiedAmount <= 0) {
      return {
        success: false,
        error: "You must verify the UTR and enter a valid ₹ amount before adding to the Hall of Patrons.",
      };
    }

    tx.isPublishedToPatrons = Boolean(publish);
    tx.isPublic = Boolean(publish);
    const tier = tx.patronTier || computePatronTier(tx.verifiedAmount);
    tx.patronTier = tier;

    if (publish) {
      if (tx.donorRecordId) {
        await Donor.findByIdAndUpdate(tx.donorRecordId, {
          name: tx.donorName,
          amount: tx.verifiedAmount,
          tier,
          message: tx.message || "",
          isAnonymous: tx.isAnonymous,
          isVisible: true,
          isPublic: true,
          totalAmount: tx.verifiedAmount,
          donationCount: 1,
          latestMessage: tx.message || "",
          lastDonatedAt: tx.createdAt || new Date(),
        });
      } else {
        const createdDonor = await Donor.create({
          uuid: crypto.randomUUID(),
          userId: tx.userId || null,
          userUuid: tx.userId || null,
          username: tx.username || null,
          name: tx.donorName,
          amount: tx.verifiedAmount,
          tier,
          message: tx.message || "",
          isAnonymous: tx.isAnonymous,
          isVisible: true,
          utr: tx.utr,
          transactionId: tx.transactionId,
          transactionRef: String(tx._id),
          verifiedBy: (adminUser as any).username || "Admin",
          donatedAt: tx.createdAt || new Date(),
          lastDonatedAt: tx.createdAt || new Date(),
          totalAmount: tx.verifiedAmount,
          donationCount: 1,
          latestMessage: tx.message || "",
          isPublic: true,
        });
        tx.donorRecordId = String(createdDonor._id);
      }
    } else if (tx.donorRecordId) {
      await Donor.findByIdAndUpdate(tx.donorRecordId, { isVisible: false });
    }

    await tx.save();

    revalidatePath("/donate");
    revalidatePath("/dashboard/admin");
    revalidatePath("/dashboard/admin/donations");

    return {
      success: true,
      message: publish
        ? `${tx.donorName} is now live in the Hall of Patrons!`
        : `${tx.donorName} was removed from the public Hall of Patrons.`,
    };
  } catch (error: any) {
    console.error("[adminToggleHallOfPatrons] Error:", error);
    return {
      success: false,
      error: error.message || "Failed to toggle Hall of Patrons status.",
    };
  }
}

/**
 * 6. Admin Action: Reject an Invalid / Fake UTR Submission
 */
export async function adminRejectDonationTransaction(
  transactionDbId: string,
  adminNote?: string
) {
  try {
    const adminUser = await requireOwnerSession();

    const tx = await DonationTransaction.findById(transactionDbId);
    if (!tx) {
      return { success: false, error: "Transaction not found." };
    }

    tx.status = "rejected";
    tx.verifiedAmount = null;
    tx.patronTier = null;
    tx.isPublishedToPatrons = false;
    tx.isPublic = false;
    tx.adminNote = sanitizeDonationText(
      adminNote || "UTR / Transaction ID could not be verified in bank statement.",
      500
    );
    tx.verifiedBy = (adminUser as any).username || "Admin";
    tx.verifiedAt = new Date();

    if (tx.donorRecordId) {
      await Donor.findByIdAndUpdate(tx.donorRecordId, { isVisible: false });
    }

    await tx.save();

    revalidatePath("/donate");
    revalidatePath("/dashboard/admin");
    revalidatePath("/dashboard/admin/donations");

    return {
      success: true,
      message: `Transaction (UTR: ${tx.utr}) marked as Rejected.`,
    };
  } catch (error: any) {
    console.error("[adminRejectDonationTransaction] Error:", error);
    return {
      success: false,
      error: error.message || "Failed to reject transaction.",
    };
  }
}

/**
 * 7. Admin Action: Update UPI Settings (UPI ID, Payee Name, QR Code URL)
 */
export async function adminUpdateDonationSettings(input: {
  upiId: string;
  payeeName: string;
  qrCodeUrl?: string;
  isEnabled?: boolean;
  customInstructions?: string;
  thankYouNote?: string;
}) {
  try {
    const adminUser = await requireOwnerSession();

    const upiId = sanitizeDonationText(input.upiId, 100);
    const payeeName = sanitizeDonationText(input.payeeName, 80);
    const qrCodeUrl = sanitizeDonationText(input.qrCodeUrl || "", 300);
    const isSafeQrCodeUrl = !qrCodeUrl || (qrCodeUrl.startsWith("/") && !qrCodeUrl.startsWith("//")) || (() => { try { return new URL(qrCodeUrl).protocol === "https:"; } catch { return false; } })();
    if (!isSafeQrCodeUrl) return { success: false, error: "QR image must use a same-site path or a secure HTTPS image URL." };

    if (!/^[a-zA-Z0-9._-]{2,100}@[a-zA-Z0-9.-]{2,64}$/.test(upiId)) {
      return { success: false, error: "Please enter a valid UPI ID (e.g. name@upi)." };
    }

    let settings = await DonationSetting.findOne();
    if (!settings) {
      settings = new DonationSetting({});
    }

    settings.upiId = upiId;
    settings.payeeName = payeeName || "ConceptNichod";
    settings.qrCodeUrl = "";
    settings.isEnabled = input.isEnabled ?? true;
    settings.updatedBy = (adminUser as any).username || "Admin";
    if (input.customInstructions !== undefined) settings.subtext = sanitizeDonationText(input.customInstructions, 500);
    settings.customInstructions = settings.subtext || settings.customInstructions;
    if (input.thankYouNote !== undefined) settings.thankYouNote = sanitizeDonationText(input.thankYouNote, 500);

    await settings.save();

    revalidatePath("/donate");
    revalidatePath("/dashboard/admin");
    revalidatePath("/dashboard/admin/donations");

    return {
      success: true,
      message: "UPI Donation settings updated successfully.",
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Failed to update UPI settings.",
    };
  }
}

/* Backward-compatible exports retained for existing imports. */
export async function getDonationInfoAction() {
  await connectToDatabase();
  let setting = await DonationSetting.findOne().lean();
  if (!setting) {
    setting = await DonationSetting.create({ upiId:"", payeeName:"ConceptNichod", qrCodeUrl:"", isEnabled:false });
  }

  // Keep legacy public metrics bank-verified only; unverified claims never contribute.
  const verifiedDonations = await DonationTransaction.aggregate([
    { $match: { status: "verified", verifiedAmount: { $gt: 0 } } },
    { $sort: { verifiedAt: 1, _id: 1 } },
    { $group: { _id: "$userUuid", username: { $last: "$username" }, totalAmount: { $sum: "$verifiedAmount" }, donationCount: { $sum: 1 }, lastDonatedAt: { $max: "$verifiedAt" }, latestMessage: { $last: "$message" } } },
    { $sort: { totalAmount: -1, lastDonatedAt: -1 } }
  ]);
  // Hall of Patrons publication remains a separate explicit Admin decision.
  const publishedPatrons = await Donor.find({ isVisible:true, isPublic:true, amount:{ $gt:0 } })
    .select("uuid username name amount totalAmount donationCount tier message latestMessage donatedAt lastDonatedAt isAnonymous")
    .sort({ amount:-1, donatedAt:-1 }).limit(150).lean();
  const donors = publishedPatrons.map((d:any)=>({
    uuid: crypto.createHash("sha256").update(String(d.uuid || d._id)).digest("hex").slice(0,16),
    username: d.isAnonymous ? null : d.username || null,
    name: d.isAnonymous ? "Anonymous Patron" : d.name,
    totalAmount: Number(d.amount) || 0,
    amount: Number(d.amount) || 0,
    donationCount: Number(d.donationCount) || 1,
    tier: d.tier || "SUPPORTER",
    latestMessage: d.message || d.latestMessage || "",
    message: d.message || d.latestMessage || "",
    lastDonatedAt: d.donatedAt || d.lastDonatedAt || null,
    donatedAt: d.donatedAt || d.lastDonatedAt || null,
  }));
  const recentTransactionDocs = await DonationTransaction.find({ isPublic: true, status: "verified" })
    .select("-utr -transactionId -userUuid -uuid")
    .sort({ donatedAt: -1 }).limit(10).lean();
  const recentTransactions = recentTransactionDocs.map((tx:any)=>({
    ...tx,
    publicId: crypto.createHash("sha256").update(String(tx._id)).digest("hex").slice(0,16),
    _id: undefined,
  }));
  const publicSettings = JSON.parse(JSON.stringify(setting));
  if (process.env.DONATIONS_ENABLED !== "true") publicSettings.upiId = "";
  publicSettings.qrCodeUrl = "";
  // Evaluated for audit parity; only publishedPatrons are returned publicly.
  void verifiedDonations;
  return { success:true, settings:publicSettings, donors:JSON.parse(JSON.stringify(donors)), recentTransactions:JSON.parse(JSON.stringify(recentTransactions)) };
}

export async function submitDonationUtrAction(payload: { amount: number; utr: string; message?: string }) {
  return { success: false, error: "The donation form has been updated. Submit your donor name, 12-digit UTR and payment-app Transaction ID using /donate." };
}
export async function reconcileDonationManuallyAction(payload: { utr: string; bankReference: string; receivedAmount: number; recipientVpa: string }) {
  await requireOwnerSession();
  const utr = String(payload.utr || "").trim();
  if (String(payload.bankReference || "").trim() !== utr) return { success:false, error:"Bank reference mismatch." };
  const tx = await DonationTransaction.findOne({ utr }).select("_id").lean();
  if (!tx) return { success:false, error:"No donation submission found for this UTR." };
  const settings = await DonationSetting.findOne().select("upiId").lean();
  if (String(payload.recipientVpa || "").trim().toLowerCase() !== String((settings as any)?.upiId || "").trim().toLowerCase()) return { success:false, error:"Recipient VPA does not match the configured donation UPI ID." };
  return adminVerifyDonationAndSetAmount({
    transactionDbId: String(tx._id),
    verifiedAmount: payload.receivedAmount,
    bankReference: payload.bankReference,
    recipientVpa: payload.recipientVpa,
    publishToHallOfPatrons: false,
  });
}
export async function getPendingDonationsAdminAction() {
  const res = await getAdminDonationDashboard("pending");
  if (!res.success) throw new Error(res.error || "Unable to load donations.");
  return (res.transactions || []).map((t:any)=>({ utr:t.utr, transactionId:t.transactionId, username:t.username || "", donorName:t.donorName, claimedAmount:null, message:t.message || "", submittedAt:t.createdAt }));
}
export async function getCurrentUserDonationContextAction() {
  try {
    const sessionUuid = verifySessionCookie((await cookies()).get("user_session")?.value);
    if (!sessionUuid) return { success:false, username:null };
    await connectToDatabase();
    const user = await User.findOne({ uuid:sessionUuid }).select("username fullName").lean();
    if (!user) return { success:false, username:null };
    return { success:true, username:(user as any).username, name:(user as any).fullName || (user as any).username };
  } catch { return { success:false, username:null }; }
}
export async function getAdminDonationSettingsAction() {
  await requireOwnerSession();
  const settings = await DonationSetting.findOne().select("upiId qrCodeUrl isEnabled").lean();
  return {
    success: true,
    settings: {
      upiId: (settings as any)?.upiId || "",
      qrCodeUrl: "",
      isEnabled: Boolean((settings as any)?.isEnabled),
    },
  };
}
export async function updateDonationSettingsAction(payload: { upiId:string; qrCodeUrl?:string; customInstructions?:string; thankYouNote?:string }) {
  return adminUpdateDonationSettings({ upiId:payload.upiId, payeeName:"ConceptNichod", qrCodeUrl:payload.qrCodeUrl || "", isEnabled:true, customInstructions:payload.customInstructions, thankYouNote:payload.thankYouNote });
}
export async function addDonorCardAction(payload: { username:string; amount:number; tier?:"Supporter"|"Patron"|"Benefactor"|"Legend"; message?:string }) {
  return adminAddManualPatron({ name:payload.username, amount:payload.amount, tier:payload.tier, message:payload.message });
}
export async function deleteDonorCardAction(uuid:string) {
  await requireOwnerSession(); await connectToDatabase();
  const donor = await Donor.findOne({ uuid });
  if (donor) { donor.isVisible=false; donor.isPublic=false; await donor.save(); }
  return { success:true };
}
export async function adminUpdatePatron(payload:{ donorId:string; name?:string; amount:number|string; tier?:string; message?:string; isAnonymous?:boolean }) {
  await requireOwnerSession(); await connectToDatabase();
  const amount = validateAdminVerifiedAmount(payload.amount);
  if (!amount.valid || !amount.data) return {success:false,error:amount.error || "Invalid amount."};
  const donor = await Donor.findById(payload.donorId);
  if (!donor) return {success:false,error:"Patron not found."};
  const tier = payload.tier && VALID_TIERS.includes(payload.tier as PatronTier) ? payload.tier as PatronTier : computePatronTier(amount.data);
  if (donor.transactionRef) {
    const linkedTransaction = await DonationTransaction.findById(donor.transactionRef).select("status verifiedAmount").lean();
    if (!linkedTransaction || linkedTransaction.status !== "verified" || Number(linkedTransaction.verifiedAmount) !== amount.data) {
      return { success:false, error:"The amount of a linked payment record is locked. Reconcile the bank reference and recipient VPA in the transaction queue first." };
    }
  }
  donor.name = sanitizeDonationText(payload.name || donor.name,60);
  donor.amount = amount.data; donor.totalAmount = amount.data; donor.tier = tier;
  donor.message = sanitizeDonationText(payload.message || "",250); donor.latestMessage = donor.message;
  donor.isAnonymous = Boolean(payload.isAnonymous); donor.isVisible = true; donor.isPublic = true;
  await donor.save();
  if (donor.transactionRef) await DonationTransaction.findByIdAndUpdate(donor.transactionRef,{verifiedAmount:amount.data,amount:amount.data,patronTier:tier,isPublishedToPatrons:true,isPublic:true});
  revalidatePath("/donate"); revalidatePath("/dashboard/admin/donations");
  return {success:true,message:"Hall of Patrons entry updated."};
}
export async function adminRemovePatron(donorId:string) {
  await requireOwnerSession(); await connectToDatabase();
  const donor = await Donor.findById(donorId);
  if (!donor) return {success:false,error:"Patron not found."};
  donor.isVisible=false; donor.isPublic=false; await donor.save();
  if (donor.transactionRef) await DonationTransaction.findByIdAndUpdate(donor.transactionRef,{isPublishedToPatrons:false,isPublic:false});
  revalidatePath("/donate"); revalidatePath("/dashboard/admin/donations");
  return {success:true,message:"Patron hidden from the Hall of Patrons."};
}
export async function adminAddManualPatron(payload:{name:string;amount:number|string;tier?:string;message?:string;isAnonymous?:boolean}) {
  await requireOwnerSession(); await connectToDatabase();
  const amount = validateAdminVerifiedAmount(payload.amount);
  const name = sanitizeDonationText(payload.name,60);
  if (!amount.valid || !amount.data) return {success:false,error:amount.error || "Invalid amount."};
  if (name.length < 2) return {success:false,error:"Patron name is required."};
  const tier = payload.tier && VALID_TIERS.includes(payload.tier as PatronTier) ? payload.tier as PatronTier : computePatronTier(amount.data);
  const message = sanitizeDonationText(payload.message || "",250);
  const donor = await Donor.create({uuid:crypto.randomUUID(),name,amount:amount.data,totalAmount:amount.data,donationCount:1,tier,message,latestMessage:message,isAnonymous:Boolean(payload.isAnonymous),isVisible:true,isPublic:true,donatedAt:new Date(),lastDonatedAt:new Date()});
  revalidatePath("/donate"); revalidatePath("/dashboard/admin/donations");
  return {success:true,donorId:String(donor._id),message:"Manual patron added."};
}
