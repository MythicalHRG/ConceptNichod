// src/app/donate/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Rupee } from "@/components/ui/rupee-symbol";
import {
  getPublicDonationPageData,
  submitDonationTransaction,
} from "@/app/actions/donation";
import {
  Copy,
  CheckCircle2,
  ShieldCheck,
  Award,
  Heart,
  Sparkles,
  ArrowLeft,
  Send,
  AlertCircle,
} from "lucide-react";

interface PatronItem {
  id: string;
  name: string;
  username?: string | null;
  amount: number;
  tier: "LEGEND" | "DIAMOND" | "GOLD" | "SILVER" | "SUPPORTER";
  message?: string;
  donatedAt: string;
}

const TIER_CONFIG: Record<
  PatronItem["tier"],
  { title: string; badgeClass: string; cardBorder: string }
> = {
  LEGEND: {
    title: "👑 Legend Patron",
    badgeClass: "bg-amber-500/20 text-amber-300 border-amber-400/50",
    cardBorder: "border-amber-500/50 shadow-[0_0_25px_rgba(245,158,11,0.15)]",
  },
  DIAMOND: {
    title: "💎 Diamond Patron",
    badgeClass: "bg-cyan-500/20 text-cyan-300 border-cyan-400/50",
    cardBorder: "border-cyan-500/40 shadow-[0_0_20px_rgba(6,182,212,0.12)]",
  },
  GOLD: {
    title: "🥇 Gold Patron",
    badgeClass: "bg-yellow-500/20 text-yellow-300 border-yellow-400/40",
    cardBorder: "border-yellow-500/40",
  },
  SILVER: {
    title: "🥈 Silver Patron",
    badgeClass: "bg-slate-400/20 text-slate-200 border-slate-400/40",
    cardBorder: "border-slate-700",
  },
  SUPPORTER: {
    title: "❤️ Supporter",
    badgeClass: "bg-emerald-500/20 text-emerald-300 border-emerald-400/40",
    cardBorder: "border-slate-800",
  },
};

export default function DonatePage() {
  const [settings, setSettings] = useState({
    upiId: "",
    payeeName: "ConceptNichod",
    qrCodeUrl: "/qr.png",
    isEnabled: false,
    headline: "Support ConceptNichod & Join the Hall of Patrons",
    subtext:
      "Scan the UPI QR code to contribute any amount, then submit your 12-digit UTR & Transaction ID below. Our Admin will verify it manually, enter the confirmed amount, and feature you in the Hall of Patrons!",
  });

  const [patrons, setPatrons] = useState<PatronItem[]>([]);
  const [totalRaised, setTotalRaised] = useState(0);
  const [loadingData, setLoadingData] = useState(true);

  // Form Inputs
  const [donorName, setDonorName] = useState("");
  const [utr, setUtr] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [message, setMessage] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [honeypot, setHoneypot] = useState("");

  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    async function load() {
      setLoadingData(true);
      const res = await getPublicDonationPageData();
      if (res.settings) setSettings(res.settings);
      if (res.patrons) setPatrons(res.patrons as PatronItem[]);
      if (typeof res.totalRaised === "number") setTotalRaised(res.totalRaised);
      setLoadingData(false);
    }
    load();
  }, []);

  const receiverUpiId = settings.upiId;

  const handleCopyUpi = async () => {
    await navigator.clipboard.writeText(settings.upiId);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusBanner(null);

    const cleanUtr = utr.replace(/\D/g, "");
    const cleanTxn = transactionId.replace(/\s+/g, "").toUpperCase();

    if (cleanUtr.length !== 12) {
      setStatusBanner({
        type: "error",
        text: "Please enter a valid 12-digit numeric UPI UTR / Reference Number.",
      });
      return;
    }

    if (cleanTxn.length < 6) {
      setStatusBanner({
        type: "error",
        text: "Please enter a valid Transaction ID (at least 6 alphanumeric characters).",
      });
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitDonationTransaction({
        donorName,
        utr: cleanUtr,
        transactionId: cleanTxn,
        message,
        isAnonymous,
        honeypot,
      });

      if (!result.success) {
        setStatusBanner({
          type: "error",
          text: result.error || "Could not submit your transaction details.",
        });
      } else {
        setStatusBanner({
          type: "success",
          text:
            result.message ||
            "UTR & Transaction ID sent to Admin Panel! Once verified, you will appear in the Hall of Patrons.",
        });
        setDonorName("");
        setUtr("");
        setTransactionId("");
        setMessage("");
        setIsAnonymous(false);
      }
    } catch {
      setStatusBanner({
        type: "error",
        text: "An unexpected error occurred. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-14">
        {/* Top Back Link */}
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <a
            href="#hall-of-patrons"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300"
          >
            <Award className="w-4 h-4" />
            View Hall of Patrons ({patrons.length})
          </a>
        </div>

        {/* Hero Section */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            100% Direct Student-First Support
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
            {settings.headline}
          </h1>
          <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
            {settings.subtext}
          </p>
        </div>

        {/* Main 2-Column Section: Step 1 (QR Code) + Step 2 (Submit UTR & Transaction ID) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Step 1: Direct UPI QR Card */}
          <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                Step 1 • Scan & Pay Any Amount
              </span>
              <span className="text-[11px] text-slate-400">Direct UPI</span>
            </div>

            <div className="bg-white p-4 rounded-2xl flex flex-col items-center justify-center max-w-[240px] mx-auto shadow-xl">
              <img
                src={settings.qrCodeUrl || "/qr.png"}
                alt="ConceptNichod UPI QR Code"
                className="w-48 h-48 object-contain rounded-lg"
              />
              <span className="mt-2 text-xs font-bold text-slate-800">
                Pay to {settings.payeeName}
              </span>
            </div>

            {/* Copyable UPI ID Box */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] text-slate-500 uppercase font-semibold">
                  Official UPI ID
                </p>
                <p className="text-sm font-mono font-bold text-slate-200 truncate">
                  {receiverUpiId ? receiverUpiId : "Recipient UPI ID will appear once enabled."}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopyUpi}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition shrink-0"
              >
                {copiedUpi ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy ID
                  </>
                )}
              </button>
            </div>

            <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-xl p-4 space-y-2 text-xs text-slate-300">
              <div className="flex items-center gap-2 font-semibold text-indigo-300">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                Manual Admin Reconciliation
              </div>
              <p className="text-slate-400 leading-relaxed">
                After paying via GPay, PhonePe, Paytm, or BHIM, copy your{" "}
                <strong className="text-slate-200">12-digit UTR</strong> and{" "}
                <strong className="text-slate-200">Transaction ID</strong>. Our Admin manually
                verifies every transaction in the Admin Panel, enters the exact amount received,
                and promotes your profile to the <strong className="text-amber-300">Hall of Patrons</strong>.
              </p>
            </div>
          </div>

          {/* Step 2: Submit UTR + Transaction ID Form */}
          <form
            onSubmit={handleSubmit}
            className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-5"
          >
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Step 2 • Send UTR & Transaction ID to Admin Panel
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-white mt-1">
                Submit Payment Reference for Verification
              </h2>
            </div>

            {statusBanner && (
              <div
                className={`p-4 rounded-xl border text-xs sm:text-sm flex items-start gap-2.5 ${
                  statusBanner.type === "success"
                    ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-200"
                    : "bg-rose-950/60 border-rose-500/40 text-rose-200"
                }`}
              >
                {statusBanner.type === "success" ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                )}
                <span>{statusBanner.text}</span>
              </div>
            )}

            {/* Honeypot field */}
            <input
              type="text"
              name="honeypot"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              className="hidden"
              tabIndex={-1}
              autoComplete="off"
            />

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Your Name (for Hall of Patrons) <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={60}
                placeholder="Enter your full name"
                value={donorName}
                onChange={(e) => setDonorName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  12-Digit UTR / UPI Ref No. <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  inputMode="numeric"
                  maxLength={12}
                  placeholder="e.g. 431987654321"
                  value={utr}
                  onChange={(e) => setUtr(e.target.value.replace(/\D/g, "").slice(0, 12))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-sm text-white focus:outline-none focus:border-indigo-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  12-digit numeric UPI Reference ({utr.length}/12 digits)
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Transaction ID <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={45}
                  placeholder="e.g. T2611151423598812"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-sm text-white focus:outline-none focus:border-indigo-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Alphanumeric Transaction ID from your UPI app
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Message for Hall of Patrons <span className="text-slate-500">(Optional)</span>
              </label>
              <textarea
                rows={3}
                maxLength={250}
                placeholder="Write a message to display on your Patron card..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-indigo-600"
              />
              <span className="text-xs text-slate-300">
                Show me as <strong>Anonymous Patron</strong> in the public Hall of Patrons
              </span>
            </label>

            <button
              type="submit"
              disabled={submitting || !settings.isEnabled}
              className="w-full py-3 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition"
            >
              <Send className="w-4 h-4" />
              {!settings.isEnabled ? "Donations Temporarily Unavailable" : submitting ? "Submitting UTR & Transaction ID..." : "Submit UTR & Transaction ID to Admin"}
            </button>
          </form>
        </div>

        {/* Hall of Patrons Leaderboard */}
        <section id="hall-of-patrons" className="pt-10 border-t border-slate-800/80 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-400">
                <Award className="w-4 h-4" />
                Hall of Patrons
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
                Verified Patrons & Supporters
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Manually verified by the Admin after UTR & Transaction ID reconciliation.
              </p>
            </div>

            <div className="flex items-center gap-5 bg-slate-900 border border-slate-800 rounded-2xl px-5 py-3">
              <div>
                <p className="text-[11px] text-slate-400">Total Verified Support</p>
                <p className="text-xl font-extrabold text-emerald-400">
                  ₹{totalRaised.toLocaleString("en-IN")}
                </p>
              </div>
              <div className="h-8 w-px bg-slate-800" />
              <div>
                <p className="text-[11px] text-slate-400">Verified Patrons</p>
                <p className="text-xl font-extrabold text-white">{patrons.length}</p>
              </div>
            </div>
          </div>

          {loadingData ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-36 rounded-2xl bg-slate-900/50 border border-slate-800 animate-pulse"
                />
              ))}
            </div>
          ) : patrons.length === 0 ? (
            <div className="text-center py-12 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-2">
              <Heart className="w-8 h-8 text-rose-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-200">
                Be the first verified supporter in the Hall of Patrons!
              </p>
              <p className="text-xs text-slate-400">
                Submit your UTR & Transaction ID above after completing a UPI contribution.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {patrons.map((patron) => {
                const cfg = TIER_CONFIG[patron.tier] || TIER_CONFIG.SUPPORTER;
                return (
                  <div
                    key={patron.id}
                    className={`bg-slate-900/90 border ${cfg.cardBorder} rounded-2xl p-5 flex flex-col justify-between space-y-4`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${cfg.badgeClass}`}
                        >
                          {cfg.title}
                        </span>
                        <span className="text-base font-extrabold text-emerald-400">
                          <Rupee />{patron.amount.toLocaleString("en-IN")}
                        </span>
                      </div>

                      <div>
                        <h3 className="text-base font-bold text-white truncate">
                          {patron.name}
                        </h3>
                        {patron.username && (
                          <Link
                            href={`/profile/${patron.username}`}
                            className="text-xs text-indigo-400 hover:underline"
                          >
                            @{patron.username}
                          </Link>
                        )}
                      </div>

                      {patron.message && (
                        <p className="text-xs text-slate-300 italic bg-slate-950/70 p-3 rounded-xl border border-slate-800">
                          &ldquo;{patron.message}&rdquo;
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-800/70">
                      <span className="text-emerald-400 font-medium">✔ Admin Verified</span>
                      <span>{new Date(patron.donatedAt).toLocaleDateString("en-IN")}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
