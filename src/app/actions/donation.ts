// src/app/actions/donation.ts
"use server";

import mongoose from "mongoose";
import { ensurePlatformOwnerRole, isPlatformOwner } from "@/lib/owner-access";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import connectToDatabase from "@/lib/mongoose";
import DonationTransaction from "@/models/DonationTransaction";
import Donor from "@/models/Donor";
import DonationSetting from "@/models/DonationSetting";
import User from "@/models/User";
import Blacklist from "@/models/Blacklist";
import { cookies } from "next/headers";
import { verifySessionCookie } from "@/lib/session";
import crypto from "crypto";
import { syncDonationDonor } from "@/lib/donation-donor-sync.js";
import { getClientIp } from "@/lib/ip";
import { checkDistributedRateLimit } from "@/lib/distributed-rate-limiter";
import { normalizeEmail } from "@/lib/email-utils";
import {
  validateDonationSubmission,
  validateAdminVerifiedAmount,
  computePatronTier,
  sanitizeDonationText,
  normalizeVpa,
  PatronTier,
} from "@/lib/donation-validation";

const VALID_TIERS: PatronTier[] = ["LEGEND", "DIAMOND", "GOLD", "SILVER", "SUPPORTER"];

// Owner-confirmed official recipient VPA used when no valid Admin setting exists.
const DEFAULT_DONATION_UPI_ID = "harsh.2525@ptaxis";

/**
 * Resolve one deterministic settings record and heal legacy disabled rows.
 * A configured, valid recipient always outranks an empty/invalid legacy row.
 */
async function getCanonicalDonationSettings() {
  await connectToDatabase();
  const records = await DonationSetting.find({}).sort({ updatedAt: -1, _id: -1 }).lean();
  const configured = records.find((record: any) => Boolean(normalizeVpa(record.upiId || "")));
  const canonical = configured || records[0] || null;
  await DonationSetting.updateMany(
    { isEnabled: { $ne: true } },
    { $set: { isEnabled: true } }
  );

  // Do not leave the public payment flow blank when the database has no valid VPA.
  // Admin can still replace this fallback through the existing UPI settings screen.
  if (!configured) {
    if (records.length > 0) {
      await DonationSetting.updateMany({}, { $set: { upiId: DEFAULT_DONATION_UPI_ID, isEnabled: true } });
    }
    return {
      ...(canonical || {}),
      upiId: DEFAULT_DONATION_UPI_ID,
      payeeName: canonical?.payeeName || "ConceptNichod",
      isEnabled: true,
    };
  }

  return { ...canonical, isEnabled: true };
}

async function saveCanonicalDonationSettings(values: Record<string, unknown>) {
  const canonical = await getCanonicalDonationSettings();
  const update = { ...values, isEnabled: true };
  if (canonical?._id) {
    await DonationSetting.findByIdAndUpdate(canonical._id, { $set: update }, { new: true, runValidators: true });
  } else {
    await DonationSetting.create(update);
  }
  // Keep every historical row in sync so a stale duplicate cannot resurface.
  await DonationSetting.updateMany({}, { $set: update });
  return getCanonicalDonationSettings();
}

function createDonorStore() {
  return {
    findOneByTransactionRef: async (transactionRef: string) =>
      await Donor.findOne({ transactionRef }),
    upsertByUuid: async (donorUuid: string, data: Record<string, unknown>) =>
      await Donor.findOneAndUpdate(
        { uuid: donorUuid },
        { $set: data, $setOnInsert: { uuid: donorUuid } },
        { upsert: true, new: true, runValidators: true }
      ),
    updateByUuid: async (donorUuid: string, data: Record<string, unknown>) =>
      await Donor.findOneAndUpdate(
        { uuid: donorUuid },
        { $set: data },
        { new: true, runValidators: true }
      ),
    updateById: async (donorId: string, data: Record<string, unknown>) => {
      if (!mongoose.isValidObjectId(donorId)) return null;
      return await Donor.findByIdAndUpdate(
        donorId,
        { $set: data },
        { new: true, runValidators: true }
      );
    },
  };
}

function getSafeAdminError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("Unauthorized") || message.startsWith("Forbidden")) {
    return message;
  }
  return fallback;
}

async function requireOwnerSession() {
  await connectToDatabase();
  const sessionUuid = verifySessionCookie((await cookies()).get("user_session")?.value);
  if (!sessionUuid) throw new Error("Unauthorized: Please log in as Admin.");
  const fetchedAdminUser = await User.findOne({ uuid: sessionUuid }).select("uuid username email role").lean();
  const adminUser = fetchedAdminUser ? await ensurePlatformOwnerRole(fetchedAdminUser) : fetchedAdminUser;
  if (!isPlatformOwner(adminUser)) throw new Error("Forbidden: Owner privileges required.");
  return adminUser;
}

/**
 * 1. Public Data Loader for /donate (UPI Config + Verified Hall of Patrons)
 */
export async function getPublicDonationPageData() {
  noStore();
  try {
    await connectToDatabase();
    const settings = await getCanonicalDonationSettings();
    const configuredVpa = normalizeVpa(settings?.upiId || "");

    const [patronsRaw, totalRaisedAgg] = await Promise.all([
      Donor.find({ isVisible: true, isPublic: true, amount: { $gt: 0 } })
        .select("name username amount tier message isAnonymous donatedAt createdAt")
        .sort({ amount: -1, donatedAt: -1 })
        .limit(150)
        .lean(),
      Donor.aggregate([
        { $match: { isVisible: true, isPublic: true, amount: { $gt: 0 } } },
        { $group: { _id: null, totalRaised: { $sum: "$amount" }, totalPatrons: { $sum: 1 } } },
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
    const totalPatrons = Number(totalRaisedAgg[0]?.totalPatrons ?? patrons.length);

    return {
      success: true,
      settings: {
        upiId: configuredVpa || DEFAULT_DONATION_UPI_ID,
        payeeName: settings?.payeeName || process.env.NEXT_PUBLIC_UPI_NAME || "ConceptNichod",
        qrCodeUrl: "",
        isEnabled: true,
        headline:
          settings?.headline || "Support ConceptNichod & Join the Hall of Patrons",
        subtext:
          settings?.subtext ||
          "Pay using any UPI app to the verified UPI ID above, then submit your 12-digit UTR and Transaction ID below for manual Admin verification.",
      },
      patrons,
      totalRaised,
      totalPatrons,
    };
  } catch (error) {
    console.error("[getPublicDonationPageData] Error:", error);
    return {
      success: false,
      settings: {
        upiId: DEFAULT_DONATION_UPI_ID,
        payeeName: process.env.NEXT_PUBLIC_UPI_NAME || "ConceptNichod",
        qrCodeUrl: "",
        isEnabled: true,
        headline: "Support ConceptNichod & Join the Hall of Patrons",
        subtext:
          "Pay using any UPI app to the verified UPI ID above, then submit your 12-digit UTR and Transaction ID below.",
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
  claimedAmount?: number | string;
  message?: string;
  isAnonymous?: boolean;
  honeypot?: string;
}) {
  try {
    if (!formData || typeof formData !== "object") {
      return { success: false, error: "Invalid submission details." };
    }

    if (typeof formData.honeypot === "string" && formData.honeypot.trim() !== "") {
      return { success: true, message: "Your UTR & Transaction ID have been sent to the Admin Panel for verification." };
    }

    const validation = validateDonationSubmission(formData);
    if (!validation.valid || !validation.data) {
      return { success: false, error: validation.error || "Invalid submission details." };
    }

    const { donorName, utr, transactionId, message, isAnonymous } = validation.data;
    let claimedAmount: number | null = null;
    if (formData.claimedAmount !== undefined && formData.claimedAmount !== null && formData.claimedAmount !== "") {
      const claimedAmountCheck = validateAdminVerifiedAmount(formData.claimedAmount);
      if (!claimedAmountCheck.valid || claimedAmountCheck.data === undefined) {
        return { success: false, error: "Enter a valid claimed donation amount between INR 1 and INR 1,00,00,000." };
      }
      claimedAmount = claimedAmountCheck.data;
    }
    const clientIp = await getClientIp();

    await connectToDatabase();

    // Enforce IP blacklist before allowing queue writes
    const isIpBanned = await Blacklist.findOne({ type: "ip", value: clientIp }).select("_id").lean();
    if (isIpBanned) {
      return { success: false, error: "Access denied: Your IP address is banned." };
    }

    const settings = await getCanonicalDonationSettings();
    const configuredVpa = normalizeVpa((settings as any)?.upiId || DEFAULT_DONATION_UPI_ID);
    if (!configuredVpa) {
      return { success: false, error: "Official UPI ID is not configured yet. Please contact the admin." };
    }

    const ipUnavailable = clientIp === "127.0.0.1" || clientIp === "unknown";
    const rateLimitKey = ipUnavailable ? "donate_submit:" + clientIp + ":" + utr : "donate_submit:" + clientIp;
    const rateLimit = await checkDistributedRateLimit(rateLimitKey, 5, 15 * 60 * 1000);
    if (!rateLimit.success) {
      return { success: false, error: "Too many submissions from your network. Please wait 15 minutes before trying again." };
    }

    const sessionUuid = verifySessionCookie((await cookies()).get("user_session")?.value);
    let userId: string | null = null;
    let username: string | null = null;
    if (sessionUuid) {
      const userRateLimit = await checkDistributedRateLimit(`donate_submit:user:${sessionUuid}`, 5, 15 * 60 * 1000);
      if (!userRateLimit.success) {
        return { success: false, error: "Too many submissions from your account. Please wait 15 minutes before trying again." };
      }
      const dbUser = await User.findOne({ uuid: sessionUuid }).select("uuid username email").lean();
      if (dbUser) {
        const emailVals = Array.from(
          new Set([String(dbUser.email || "").toLowerCase(), normalizeEmail(String(dbUser.email || ""))].filter(Boolean))
        );
        const userBanClauses: Array<{ type: "email" | "username"; value: string | { $in: string[] } }> = [];
        if (emailVals.length > 0) {
          userBanClauses.push({ type: "email", value: { $in: emailVals } });
        }
        if (dbUser.username) {
          userBanClauses.push({ type: "username", value: String(dbUser.username).toLowerCase() });
        }
        const userBanned =
          userBanClauses.length > 0
            ? await Blacklist.findOne({ $or: userBanClauses }).select("_id").lean()
            : null;
        if (userBanned) {
          return { success: false, error: "Access denied: Your account has been suspended." };
        }
        userId = sessionUuid;
        username = (dbUser as any).username || null;
      }
    }

    const existing = await DonationTransaction.findOne({
      $or: [{ utr }, { transactionId }],
    }).select("utr transactionId status").lean();

    if (existing) {
      const dupField = existing.utr === utr ? "12-digit UTR" : "Transaction ID";
      const existingStatus = String(existing.status || "pending").toUpperCase();
      return { success: false, error: "This " + dupField + " has already been submitted (Status: " + existingStatus + ")." };
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
      claimedAmount,
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

    if (typeof search === "string" && search.trim() !== "") {
      const escaped = search.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
      getCanonicalDonationSettings(),
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
      claimedAmount: t.claimedAmount ?? null,
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
        isEnabled: true,
      },
    };
  } catch (error: any) {
    console.error("[getAdminDonationDashboard] Error:", error);
    return {
      success: false,
      error: getSafeAdminError(error, "Failed to load Admin Donation Dashboard."),
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

    if (!payload || typeof payload !== "object" || typeof payload.transactionDbId !== "string" || !mongoose.isValidObjectId(payload.transactionDbId)) {
      return { success: false, error: "Invalid donation transaction ID." };
    }

    const amountCheck = validateAdminVerifiedAmount(payload.verifiedAmount);
    if (!amountCheck.valid || !amountCheck.data) {
      return {
        success: false,
        error: amountCheck.error || "Please enter a valid verified amount (INR).",
      };
    }

    const confirmedAmount = amountCheck.data;

    let tx = await DonationTransaction.findById(payload.transactionDbId);
    if (!tx) {
      return { success: false, error: "Donation transaction not found." };
    }
    // Resume a verified payment if its patron sync previously failed.
    const isDonorSyncRecovery =
      tx.status === "verified" && Boolean(tx.isPublishedToPatrons) && !tx.donorRecordId;
    if (tx.status && tx.status !== "pending" && !isDonorSyncRecovery) {
      return { success: false, error: "This donation has already been reviewed." };
    }

    // An admin-entered amount is not proof of payment. Require explicit bank-record
    // reference and recipient VPA confirmation before changing a transaction to verified.
    const bankReference = sanitizeDonationText(payload.bankReference || "", 60).replace(/\D/g, "");
    const submittedUtr = String(tx.utr || "").replace(/\D/g, "");
    if (!bankReference || bankReference !== submittedUtr) {
      return { success: false, error: "Bank statement UTR does not match the submitted 12-digit UTR." };
    }
    const settings = await getCanonicalDonationSettings();
    const configuredVpa = normalizeVpa((settings as any)?.upiId);
    const recipientVpa = normalizeVpa(sanitizeDonationText(payload.recipientVpa || "", 100));
    if (!configuredVpa) {
      return { success: false, error: "Configure your Official UPI ID in UPI Settings first before verifying donations." };
    }
    if (!recipientVpa || recipientVpa !== configuredVpa) {
      return { success: false, error: "Recipient VPA does not match your configured Official UPI ID." };
    }

    if (isDonorSyncRecovery && Number(tx.verifiedAmount) !== confirmedAmount) {
      return { success: false, error: "This verified donation amount is locked; retry patron synchronization with the original amount." };
    }
    const tier: PatronTier = isDonorSyncRecovery
      ? (tx.patronTier || computePatronTier(confirmedAmount))
      : payload.customTier && VALID_TIERS.includes(payload.customTier as PatronTier)
        ? (payload.customTier as PatronTier)
        : computePatronTier(confirmedAmount);

    if (!isDonorSyncRecovery) {
      const shouldPublish = Boolean(payload.publishToHallOfPatrons);
      // Atomically claim a pending transaction so concurrent approvals cannot both proceed.
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
            amount: confirmedAmount,
            patronTier: tier,
            isPublishedToPatrons: shouldPublish,
            isPublic: shouldPublish,
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
    }

    // Synchronize a transaction-scoped Donor row with fixed $set values.
    // Retrying this block cannot increment a donation a second time.
    if (tx.isPublishedToPatrons) {
      const patronData = {
        userId: tx.userId || null,
        userUuid: tx.userId || null,
        username: tx.username || null,
        name: (tx.donorName || "").trim() || (tx.username ? `@${tx.username}` : "Supporter"),
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

      await syncDonationDonor({
        tx,
        donorData: patronData,
        donorStore: createDonorStore(),
      });
    } else if (tx.donorRecordId && mongoose.isValidObjectId(tx.donorRecordId)) {
      await Donor.findByIdAndUpdate(tx.donorRecordId, { $set: { isVisible: false, isPublic: false } });
    }

    // Keep the bank-verified status if patron sync fails; retrying the donor link is safe.
    // The transaction was atomically claimed above. Persist only the donor link
    // so legacy documents missing newly-required fields never re-enter validation.
    if (tx.isPublishedToPatrons && tx.donorRecordId) {
      await DonationTransaction.findByIdAndUpdate(tx._id, { $set: { donorRecordId: tx.donorRecordId } });
    }

    revalidatePath("/donate");
    revalidatePath("/dashboard/admin");
    revalidatePath("/dashboard/admin/donations");

    return {
      success: true,
      message: tx.isPublishedToPatrons
        ? `Verified INR ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(confirmedAmount)} and added ${tx.donorName} to the Hall of Patrons!`
        : `Verified INR ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(confirmedAmount)} for UTR ${tx.utr}.`,
    };
  } catch (error: any) {
    console.error("[adminVerifyDonationAndSetAmount] Error:", error);
    return {
      success: false,
      error: getSafeAdminError(error, "Failed to verify donation."),
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

    if (typeof transactionDbId !== "string" || !mongoose.isValidObjectId(transactionDbId)) {
      return { success: false, error: "Invalid transaction ID." };
    }

    const tx = await DonationTransaction.findById(transactionDbId);
    if (!tx) {
      return { success: false, error: "Transaction record not found." };
    }

    if (tx.status !== "verified" || !tx.verifiedAmount || !Number.isFinite(tx.verifiedAmount) || tx.verifiedAmount <= 0) {
      return {
        success: false,
        error: "You must verify the UTR and enter a valid INR amount before adding to the Hall of Patrons.",
      };
    }

    tx.isPublishedToPatrons = Boolean(publish);
    tx.isPublic = Boolean(publish);
    const tier = tx.patronTier || computePatronTier(tx.verifiedAmount);
    tx.patronTier = tier;

    if (publish) {
      const patronData = {
        userId: tx.userId || null,
        userUuid: tx.userId || null,
        username: tx.username || null,
        name: (tx.donorName || "").trim() || (tx.username ? `@${tx.username}` : "Supporter"),
        amount: tx.verifiedAmount,
        tier,
        message: tx.message || "",
        isAnonymous: tx.isAnonymous,
        isVisible: true,
        utr: tx.utr,
        transactionId: tx.transactionId || undefined,
        transactionRef: String(tx._id),
        verifiedBy: tx.verifiedBy || (adminUser as any).username || "Admin",
        donatedAt: tx.createdAt || new Date(),
        lastDonatedAt: tx.createdAt || new Date(),
        totalAmount: tx.verifiedAmount,
        donationCount: 1,
        latestMessage: tx.message || "",
        isPublic: true,
      };

      await syncDonationDonor({
        tx,
        donorData: patronData,
        donorStore: createDonorStore(),
      });
    } else if (tx.donorRecordId && mongoose.isValidObjectId(tx.donorRecordId)) {
      await Donor.findByIdAndUpdate(tx.donorRecordId, { $set: { isVisible: false, isPublic: false } });
    }

    await DonationTransaction.findByIdAndUpdate(tx._id, {
      $set: {
        isPublishedToPatrons: Boolean(publish),
        isPublic: Boolean(publish),
        patronTier: tier,
        ...(tx.donorRecordId ? { donorRecordId: tx.donorRecordId } : {}),
      },
    });

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
      error: getSafeAdminError(error, "Failed to toggle Hall of Patrons status."),
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

    if (typeof transactionDbId !== "string" || !mongoose.isValidObjectId(transactionDbId)) {
      return { success: false, error: "Invalid transaction ID." };
    }

    const tx = await DonationTransaction.findById(transactionDbId).select("_id utr donorRecordId status");
    if (!tx) {
      return { success: false, error: "Transaction not found." };
    }

    const rejectionNote = sanitizeDonationText(
      adminNote || "UTR / Transaction ID could not be verified in bank statement.",
      500
    );
    // Reject only unreviewed submissions. Include legacy rows with no status,
    // and make the state check part of the write to prevent verify/reject races.
    // Atomic field-only update deliberately bypasses validation of legacy
    // required fields (transactionId / donorName) absent from older documents.
    const rejected = await DonationTransaction.findOneAndUpdate(
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
          status: "rejected",
          isPublishedToPatrons: false,
          isPublic: false,
          adminNote: rejectionNote,
          verifiedBy: (adminUser as any).username || "Admin",
          verifiedAt: new Date(),
          donorRecordId: null,
        },
      },
      { new: true }
    );
    if (!rejected) {
      return { success: false, error: "This donation has already been reviewed or is being processed." };
    }

    if (tx.donorRecordId && mongoose.isValidObjectId(tx.donorRecordId)) {
      await Donor.findByIdAndUpdate(tx.donorRecordId, { $set: { isVisible: false, isPublic: false } });
    }

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
      error: getSafeAdminError(error, "Failed to reject donation."),
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

    if (!input || typeof input !== "object") {
      return { success: false, error: "Invalid UPI settings payload." };
    }

    const upiId = normalizeVpa(sanitizeDonationText(input.upiId, 100));
    const payeeName = sanitizeDonationText(input.payeeName, 80);
    const qrCodeUrl = sanitizeDonationText(input.qrCodeUrl || "", 300);
    const isSafeQrCodeUrl = !qrCodeUrl || (qrCodeUrl.startsWith("/") && !qrCodeUrl.startsWith("//")) || (() => { try { return new URL(qrCodeUrl).protocol === "https:"; } catch { return false; } })();
    if (!isSafeQrCodeUrl) return { success: false, error: "QR image must use a same-site path or a secure HTTPS image URL." };

    if (!upiId) {
      return { success: false, error: "Please enter a valid UPI ID (e.g. name@upi)." };
    }

    const existingSettings = await getCanonicalDonationSettings();
    const update: Record<string, unknown> = {
      upiId,
      payeeName: payeeName || "ConceptNichod",
      qrCodeUrl: "",
      isEnabled: true,
      updatedBy: (adminUser as any).username || "Admin",
    };
    if (input.customInstructions !== undefined) {
      update.subtext = sanitizeDonationText(input.customInstructions, 500);
      update.customInstructions = update.subtext;
    } else if (existingSettings?.customInstructions) {
      update.customInstructions = existingSettings.customInstructions;
    }
    if (input.thankYouNote !== undefined) update.thankYouNote = sanitizeDonationText(input.thankYouNote, 500);
    await saveCanonicalDonationSettings(update);

    revalidatePath("/donate");
    revalidatePath("/dashboard/admin");
    revalidatePath("/dashboard/admin/donations");

    return {
      success: true,
      message: "UPI Donation settings updated successfully.",
    };
  } catch (error: any) {
    console.error("[adminUpdateDonationSettings] Error:", error);
    return {
      success: false,
      error: getSafeAdminError(error, "Failed to update UPI settings."),
    };
  }
}

/* Backward-compatible exports retained for existing imports. */
export async function getDonationInfoAction() {
  await connectToDatabase();
  const setting = await getCanonicalDonationSettings();

  // Keep legacy public metrics bank-verified only; unverified claims never contribute.
  const verifiedDonations = await DonationTransaction.aggregate([
    { $match: { status: "verified", verifiedAmount: { $gt: 0 } } },
    { $sort: { verifiedAt: 1, _id: 1 } },
    { $group: { _id: "$userUuid", username: { $last: "$username" }, totalAmount: { $sum: "$verifiedAmount" }, donationCount: { $sum: 1 }, lastDonatedAt: { $max: "$verifiedAt" }, latestMessage: { $last: "$message" } } },
    { $sort: { totalAmount: -1, lastDonatedAt: -1 } }
  ]);
  // Hall of Patrons publication remains a separate explicit Admin decision.
  const publishedPatrons = await Donor.find({ isVisible: true, isPublic: true, amount: { $gt: 0 } })
    .select("uuid username name amount totalAmount donationCount tier message latestMessage donatedAt lastDonatedAt isAnonymous")
    .sort({ amount: -1, donatedAt: -1 }).limit(150).lean();
  const donors = publishedPatrons.map((d: any) => ({
    uuid: crypto.createHash("sha256").update(String(d.uuid || d._id)).digest("hex").slice(0, 16),
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

  // Strict allowlist projection prevents leaking bankReference (UTR), donorEmail, userId, adminNote, or anonymous identities.
  const recentTransactionDocs = await DonationTransaction.find({ isPublic: true, status: "verified" })
    .select("_id donorName username isAnonymous verifiedAmount amount patronTier message donatedAt verifiedAt createdAt")
    .sort({ donatedAt: -1 }).limit(10).lean();
  const recentTransactions = recentTransactionDocs.map((tx: any) => ({
    publicId: crypto.createHash("sha256").update(String(tx._id)).digest("hex").slice(0, 16),
    donorName: tx.isAnonymous ? "Anonymous Patron" : tx.donorName,
    username: tx.isAnonymous ? null : tx.username || null,
    isAnonymous: Boolean(tx.isAnonymous),
    amount: Number(tx.verifiedAmount ?? tx.amount) || 0,
    verifiedAmount: Number(tx.verifiedAmount ?? tx.amount) || 0,
    patronTier: tx.patronTier || "SUPPORTER",
    message: tx.message || "",
    donatedAt: tx.donatedAt ? new Date(tx.donatedAt).toISOString() : new Date(tx.createdAt || Date.now()).toISOString(),
  }));

  const configuredVpa = normalizeVpa(setting?.upiId || "");

  const publicSettings = {
    upiId: configuredVpa || "",
    payeeName: setting?.payeeName || "ConceptNichod",
    qrCodeUrl: "",
    isEnabled: true,
    headline: setting?.headline || "Support ConceptNichod & Join the Hall of Patrons",
    subtext: setting?.subtext || "Pay using any UPI app, then submit your 12-digit UTR and Transaction ID for manual Admin verification.",
    customInstructions: setting?.customInstructions || "Pay using any UPI app, then submit your transaction reference for manual verification.",
    thankYouNote: setting?.thankYouNote || "Thank you for supporting ConceptNichod.",
  };

  // Evaluated for audit parity; only publishedPatrons are returned publicly.
  void verifiedDonations;
  return { success: true, settings: publicSettings, donors: JSON.parse(JSON.stringify(donors)), recentTransactions };
}

export async function submitDonationUtrAction(_payload: { amount: number; utr: string; message?: string }) {
  return { success: false, error: "The donation form has been updated. Submit your donor name, 12-digit UTR and payment-app Transaction ID using /donate." };
}

export async function reconcileDonationManuallyAction(payload: { utr: string; bankReference: string; receivedAmount: number; recipientVpa: string }) {
  await requireOwnerSession();
  if (!payload || typeof payload !== "object") return { success: false, error: "Invalid reconciliation payload." };
  const utr = String(payload.utr || "").trim();
  if (!utr || String(payload.bankReference || "").trim() !== utr) return { success: false, error: "Bank reference mismatch." };
  const tx = await DonationTransaction.findOne({ utr }).select("_id").lean();
  if (!tx) return { success: false, error: "No donation submission found for this UTR." };
  const settings = await getCanonicalDonationSettings();
  const configuredVpa = normalizeVpa((settings as any)?.upiId || "");
  const suppliedVpa = normalizeVpa(String(payload.recipientVpa || ""));
  if (!configuredVpa || !suppliedVpa || suppliedVpa !== configuredVpa) {
    return { success: false, error: "Recipient VPA does not match the configured donation UPI ID." };
  }
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
  return (res.transactions || []).map((t: any) => ({
    utr: t.utr,
    transactionId: t.transactionId,
    username: t.username || "",
    donorName: t.donorName,
    claimedAmount: null,
    message: t.message || "",
    submittedAt: t.createdAt,
  }));
}

export async function getCurrentUserDonationContextAction() {
  try {
    const sessionUuid = verifySessionCookie((await cookies()).get("user_session")?.value);
    if (!sessionUuid) return { success: false, username: null };
    await connectToDatabase();
    const user = await User.findOne({ uuid: sessionUuid }).select("username fullName").lean();
    if (!user) return { success: false, username: null };
    return { success: true, username: (user as any).username, name: (user as any).fullName || (user as any).username };
  } catch {
    return { success: false, username: null };
  }
}

export async function getAdminDonationSettingsAction() {
  await requireOwnerSession();
  const settings = await getCanonicalDonationSettings();
  return {
    success: true,
    settings: {
      upiId: (settings as any)?.upiId || "",
      qrCodeUrl: "",
      isEnabled: true,
    },
  };
}

export async function adminSetDonationsEnabledAction(enabled: boolean) {
  const owner = await requireOwnerSession();
  if (typeof enabled !== "boolean") {
    throw new Error("A boolean donations-enabled value is required.");
  }

  await saveCanonicalDonationSettings({ updatedBy: owner.username || "mythicalhrg" });

  revalidatePath("/donate");
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/admin/donations");
  return { success: true, isEnabled: true };
}

export async function updateDonationSettingsAction(payload: { upiId: string; qrCodeUrl?: string; customInstructions?: string; thankYouNote?: string }) {
  return adminUpdateDonationSettings({
    upiId: payload?.upiId || "",
    payeeName: "ConceptNichod",
    qrCodeUrl: payload?.qrCodeUrl || "",
    customInstructions: payload?.customInstructions,
    thankYouNote: payload?.thankYouNote,
  });
}

export async function addDonorCardAction(payload: { username: string; amount: number; tier?: "Supporter" | "Patron" | "Benefactor" | "Legend"; message?: string }) {
  return adminAddManualPatron({
    name: payload?.username || "",
    amount: payload?.amount,
    tier: payload?.tier,
    message: payload?.message,
  });
}

export async function deleteDonorCardAction(uuid: string) {
  await requireOwnerSession();
  if (typeof uuid !== "string" || !uuid.trim()) {
    return { success: false, error: "Invalid donor identifier." };
  }
  const donor = await Donor.findOne({ uuid: uuid.trim() });
  if (donor) {
    donor.isVisible = false;
    donor.isPublic = false;
    await donor.save();
  }
  return { success: true };
}

export async function adminUpdatePatron(payload: { donorId: string; name?: string; amount: number | string; tier?: string; message?: string; isAnonymous?: boolean }) {
  try {
    await requireOwnerSession();
    if (!payload || typeof payload !== "object" || typeof payload.donorId !== "string" || !mongoose.isValidObjectId(payload.donorId)) {
      return { success: false, error: "Invalid patron ID." };
    }
    const amount = validateAdminVerifiedAmount(payload.amount);
    if (!amount.valid || !amount.data) return { success: false, error: amount.error || "Invalid amount." };
    const donor = await Donor.findById(payload.donorId);
    if (!donor) return { success: false, error: "Patron not found." };
    const tier = payload.tier && VALID_TIERS.includes(payload.tier as PatronTier) ? payload.tier as PatronTier : computePatronTier(amount.data);
    if (donor.transactionRef && mongoose.isValidObjectId(donor.transactionRef)) {
      const linkedTransaction = await DonationTransaction.findById(donor.transactionRef).select("status verifiedAmount").lean();
      if (!linkedTransaction || linkedTransaction.status !== "verified" || Number(linkedTransaction.verifiedAmount) !== amount.data) {
        return { success: false, error: "The amount of a linked payment record is locked. Reconcile the bank reference and recipient VPA in the transaction queue first." };
      }
    }
    const candidateName = payload.name !== undefined ? sanitizeDonationText(payload.name, 60) : donor.name;
    if (!candidateName || candidateName.length < 2) {
      return { success: false, error: "Patron name must be at least 2 characters." };
    }
    donor.name = candidateName;
    donor.amount = amount.data;
    donor.totalAmount = amount.data;
    donor.tier = tier;
    donor.message = sanitizeDonationText(payload.message || "", 250);
    donor.latestMessage = donor.message;
    donor.isAnonymous = Boolean(payload.isAnonymous);
    donor.isVisible = true;
    donor.isPublic = true;
    await donor.save();
    if (donor.transactionRef && mongoose.isValidObjectId(donor.transactionRef)) {
      await DonationTransaction.findByIdAndUpdate(donor.transactionRef, {
        $set: { verifiedAmount: amount.data, amount: amount.data, patronTier: tier, isPublishedToPatrons: true, isPublic: true },
      });
    }
    revalidatePath("/donate");
    revalidatePath("/dashboard/admin/donations");
    return { success: true, message: "Hall of Patrons entry updated." };
  } catch (error: any) {
    console.error("[adminUpdatePatron] Error:", error);
    return { success: false, error: getSafeAdminError(error, "Failed to update patron entry.") };
  }
}

export async function adminRemovePatron(donorId: string) {
  try {
    await requireOwnerSession();
    if (typeof donorId !== "string" || !mongoose.isValidObjectId(donorId)) {
      return { success: false, error: "Invalid patron ID." };
    }
    const donor = await Donor.findById(donorId);
    if (!donor) return { success: false, error: "Patron not found." };
    donor.isVisible = false;
    donor.isPublic = false;
    await donor.save();
    if (donor.transactionRef && mongoose.isValidObjectId(donor.transactionRef)) {
      await DonationTransaction.findByIdAndUpdate(donor.transactionRef, {
        $set: { isPublishedToPatrons: false, isPublic: false },
      });
    }
    revalidatePath("/donate");
    revalidatePath("/dashboard/admin/donations");
    return { success: true, message: "Patron hidden from the Hall of Patrons." };
  } catch (error: any) {
    console.error("[adminRemovePatron] Error:", error);
    return { success: false, error: getSafeAdminError(error, "Failed to hide patron.") };
  }
}

export async function adminAddManualPatron(payload: { name: string; amount: number | string; tier?: string; message?: string; isAnonymous?: boolean }) {
  try {
    await requireOwnerSession();
    if (!payload || typeof payload !== "object") {
      return { success: false, error: "Invalid patron payload." };
    }
    const amount = validateAdminVerifiedAmount(payload.amount);
    const name = sanitizeDonationText(payload.name, 60);
    if (!amount.valid || !amount.data) return { success: false, error: amount.error || "Invalid amount." };
    if (name.length < 2) return { success: false, error: "Patron name is required." };
    const tier = payload.tier && VALID_TIERS.includes(payload.tier as PatronTier) ? payload.tier as PatronTier : computePatronTier(amount.data);
    const message = sanitizeDonationText(payload.message || "", 250);
    const donor = await Donor.create({
      uuid: crypto.randomUUID(),
      name,
      amount: amount.data,
      totalAmount: amount.data,
      donationCount: 1,
      tier,
      message,
      latestMessage: message,
      isAnonymous: Boolean(payload.isAnonymous),
      isVisible: true,
      isPublic: true,
      donatedAt: new Date(),
      lastDonatedAt: new Date(),
    });
    revalidatePath("/donate");
    revalidatePath("/dashboard/admin/donations");
    return { success: true, donorId: String(donor._id), message: "Manual patron added." };
  } catch (error: any) {
    console.error("[adminAddManualPatron] Error:", error);
    return { success: false, error: getSafeAdminError(error, "Failed to add manual patron.") };
  }
}
