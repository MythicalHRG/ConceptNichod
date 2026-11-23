// src/app/donate/page.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
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
    badgeClass: "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-400/50",
    cardBorder: "border-amber-500/50 shadow-[0_0_25px_rgba(245,158,11,0.15)]",
  },
  DIAMOND: {
    title: "💎 Diamond Patron",
    badgeClass: "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-400/50",
    cardBorder: "border-cyan-500/40 shadow-[0_0_20px_rgba(6,182,212,0.12)]",
  },
  GOLD: {
    title: "🥇 Gold Patron",
    badgeClass: "bg-yellow-500/20 text-yellow-300 border-yellow-400/40",
    cardBorder: "border-yellow-500/40",
  },
  SILVER: {
    title: "🥈 Silver Patron",
    badgeClass: "bg-slate-400/20 text-foreground border-slate-400/40",
    cardBorder: "border-slate-700",
  },
  SUPPORTER: {
    title: "❤️ Supporter",
    badgeClass: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-400/40",
    cardBorder: "border-border",
  },
};

export default function DonatePage() {
  // Legacy /qr.png fallback is intentionally retired; never display an unverified recipient QR.
  const [settings, setSettings] = useState({
    upiId: "",
    payeeName: "ConceptNichod",
    qrCodeUrl: "",
    isEnabled: true,
    headline: "Support ConceptNichod & Join the Hall of Patrons",
    subtext:
      "Pay via the official UPI ID below, then submit your 12-digit UTR & Transaction ID. Our Admin will verify it manually, enter the confirmed amount, and feature you in the Hall of Patrons!",
  });

  const [patrons, setPatrons] = useState<PatronItem[]>([]);
  const [totalRaised, setTotalRaised] = useState(0);
  const [totalPatrons, setTotalPatrons] = useState(0);
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
  const [receipt, setReceipt] = useState<{ utr: string; transactionId: string } | null>(null);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingData(true);
      try {
        const res = await getPublicDonationPageData();
        if (cancelled) return;
        if (res.settings) {
          setSettings((prev) => ({
            ...prev,
            ...res.settings,
            upiId: res.settings.upiId || "",
            isEnabled: res.settings.isEnabled !== false,
          }));
        }
        if (Array.isArray(res.patrons)) setPatrons(res.patrons as PatronItem[]);
        if (typeof res.totalRaised === "number") setTotalRaised(res.totalRaised);
        if (typeof res.totalPatrons === "number") {
          setTotalPatrons(res.totalPatrons);
        } else if (Array.isArray(res.patrons)) {
          setTotalPatrons(res.patrons.length);
        }
      } catch (err) {
        console.error("Failed to load donation data:", err);
        if (!cancelled) {
          setStatusBanner({
            type: "error",
            text: "Unable to load donation details right now. Please refresh and try again.",
          });
        }
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    }
    load();
    return () => {
      cancelled = true;
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const receiverUpiId = settings.upiId;

  const handleCopyUpi = async () => {
    if (!settings.upiId) return;
    try {
      await navigator.clipboard.writeText(settings.upiId);
      setCopiedUpi(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedUpi(false), 2000);
    } catch {
      setStatusBanner({
        type: "error",
        text: "Could not copy UPI ID automatically. Please copy it manually from the box.",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusBanner(null);

    const cleanName = donorName.trim();
    const cleanUtr = utr.replace(/\D/g, "");
    const cleanTxn = transactionId.replace(/\s+/g, "").toUpperCase();

    if (cleanName.length < 2) {
      setStatusBanner({
        type: "error",
        text: "Please enter your name (at least 2 characters).",
      });
      return;
    }

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
        donorName: cleanName,
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
        setReceipt({ utr: cleanUtr, transactionId: cleanTxn });
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
    <div className="min-h-screen bg-background text-foreground py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-14">
        {/* Top Back Link */}
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <a
            href="#hall-of-patrons"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 hover:text-amber-700 dark:text-amber-300"
          >
            <Award className="w-4 h-4" />
            View Hall of Patrons ({totalPatrons})
          </a>
        </div>

        {/* Hero Section */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            100% Direct Student-First Support
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground">
            {settings.headline}
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
            {settings.subtext}
          </p>
        </div>

        {/* Main 2-Column Section: Step 1 (UPI Details) + Step 2 (Submit UTR & Transaction ID) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Step 1: Direct UPI Card */}
          <div className="lg:col-span-5 bg-card/90 border border-border rounded-2xl p-6 sm:p-8 space-y-6">
            {settings.isEnabled ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                    Step 1 • Pay via Official UPI ID
                  </span>
                  <div className="text-left">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Official Payee Name</p>
                    <p className="text-sm font-semibold text-foreground">{settings.payeeName}</p>
                  </div>
                  <span className="text-[11px] text-muted-foreground">Direct UPI</span>
                </div>
                <div className="rounded-xl border border-slate-700 bg-background/70 p-4 text-center">
                  <p className="text-xs font-semibold text-foreground">Use the official UPI ID</p>
                  <p className="mt-1 text-xs text-muted-foreground">No QR image is displayed until a verified QR-generation flow is available. Copy the UPI ID below and confirm the recipient name in your payment app.</p>
                </div>
                <div className="bg-background border border-border rounded-xl p-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground uppercase font-semibold">Official UPI ID</p>
                    <p className="text-sm font-mono font-bold text-foreground truncate">{receiverUpiId ? receiverUpiId : "Recipient UPI ID will appear once enabled."}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyUpi}
                    disabled={!receiverUpiId}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-foreground transition shrink-0"
                  >
                    {copiedUpi ? <><CheckCircle2 className="w-3.5 h-3.5" />Copied</> : <><Copy className="w-3.5 h-3.5" />Copy ID</>}
                  </button>
                </div>
                <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-xl p-4 space-y-2 text-xs text-foreground">
                  <div className="flex items-center gap-2 font-semibold text-indigo-300">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    Manual Admin Reconciliation
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    After paying, retain your 12-digit UTR and payment-app Transaction ID. The Admin checks the bank record and recipient account before verifying a submission.
                  </p>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-5 space-y-2">
                <p className="text-sm font-bold text-amber-200">Donations are temporarily paused</p>
                <p className="text-xs leading-relaxed text-foreground">
                  The recipient account has not been enabled for payments yet. No QR code or payment ID is displayed. Please do not send money until the official account is confirmed.
                </p>
              </div>
            )}
          </div>

          {/* Step 2: Submit UTR + Transaction ID Form */}
          <form
            onSubmit={handleSubmit}
            className="lg:col-span-7 bg-card/90 border border-border rounded-2xl p-6 sm:p-8 space-y-5"
          >
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Step 2 • Send UTR & Transaction ID to Admin Panel
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground mt-1">
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
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Your Name (for Hall of Patrons) <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={60}
                placeholder="Enter your full name"
                value={donorName}
                onChange={(e) => setDonorName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
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
                  className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border font-mono text-sm text-foreground focus:outline-none focus:border-indigo-500"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  12-digit numeric UPI Reference ({utr.length}/12 digits)
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Transaction ID <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={45}
                  placeholder="e.g. T2611151423598812"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border font-mono text-sm text-foreground focus:outline-none focus:border-indigo-500"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Alphanumeric Transaction ID from your UPI app
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Message for Hall of Patrons <span className="text-muted-foreground">(Optional)</span>
              </label>
              <textarea
                rows={3}
                maxLength={250}
                placeholder="Write a message to display on your Patron card..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-none focus:border-indigo-500"
              />
              <p className="mt-1 text-[11px] text-muted-foreground text-right">{message.length}/250</p>
            </div>

            {receipt && (
              <div role="status" className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-4 space-y-2 min-w-0 break-words">
                <div className="flex items-center gap-2 text-sm font-bold text-emerald-800 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4" /> Payment reference received</div>
                <div className="text-xs text-foreground">UTR: <span className="font-mono font-semibold">{receipt.utr}</span></div>
                <div className="text-xs text-foreground">Transaction ID: <span className="font-mono font-semibold">{receipt.transactionId}</span></div>
                <span className="inline-flex rounded-full border border-amber-500/35 bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-800 dark:text-amber-200">Pending Admin Verification</span>
              </div>
            )}

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-background text-indigo-600"
              />
              <span className="text-xs text-foreground">
                Show me as <strong>Anonymous Patron</strong> in the public Hall of Patrons
              </span>
            </label>

            <button
              type="submit"
              disabled={submitting || !settings.isEnabled}
              className="w-full py-3 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-foreground font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition"
            >
              <Send className="w-4 h-4" />
              {!settings.isEnabled ? "Donations Temporarily Unavailable" : submitting ? "Submitting UTR & Transaction ID..." : "Submit UTR & Transaction ID to Admin"}
            </button>
          </form>
        </div>

        {/* Hall of Patrons Leaderboard */}
        <section id="hall-of-patrons" className="pt-10 border-t border-border/80 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-400">
                <Award className="w-4 h-4" />
                Hall of Patrons
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground mt-1">
                Verified Patrons & Supporters
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                Manually verified by the Admin after UTR & Transaction ID reconciliation.
              </p>
            </div>

            <div className="flex items-center gap-5 bg-card border border-border rounded-2xl px-5 py-3">
              <div>
                <p className="text-[11px] text-muted-foreground">Total Verified Support</p>
                <p className="text-xl font-extrabold text-emerald-400">
                  <Rupee />{totalRaised.toLocaleString("en-IN")}
                </p>
              </div>
              <div className="h-8 w-px bg-slate-800" />
              <div>
                <p className="text-[11px] text-muted-foreground">Verified Patrons</p>
                <p className="text-xl font-extrabold text-foreground">{totalPatrons}</p>
              </div>
            </div>
          </div>

          {loadingData ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-36 rounded-2xl bg-card/50 border border-border animate-pulse"
                />
              ))}
            </div>
          ) : patrons.length === 0 ? (
            <div className="text-center py-12 bg-card/40 border border-border rounded-2xl space-y-2">
              <Heart className="w-8 h-8 text-rose-400 mx-auto" />
              <p className="text-sm font-semibold text-foreground">
                Be the first verified supporter in the Hall of Patrons!
              </p>
              <p className="text-xs text-muted-foreground">
                Submit your UTR & Transaction ID above after completing a UPI contribution.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {patrons.map((patron) => {
                const cfg = TIER_CONFIG[patron.tier] || TIER_CONFIG.SUPPORTER;
                const donatedDate = new Date(patron.donatedAt);
                const formattedDate = Number.isFinite(donatedDate.getTime())
                  ? donatedDate.toLocaleDateString("en-IN")
                  : "";
                return (
                  <div
                    key={patron.id}
                    className={`bg-card/90 border ${cfg.cardBorder} rounded-2xl p-5 flex flex-col justify-between space-y-4`}
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
                        <h3 className="text-base font-bold text-foreground truncate">
                          {patron.name}
                        </h3>
                        {patron.username && (
                          <Link
                            href={`/profile/${encodeURIComponent(patron.username)}`}
                            className="text-xs text-indigo-400 hover:underline"
                          >
                            @{patron.username}
                          </Link>
                        )}
                      </div>

                      {patron.message && (
                        <p className="text-xs text-foreground italic bg-background/70 p-3 rounded-xl border border-border">
                          &ldquo;{patron.message}&rdquo;
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/70">
                      <span className="text-emerald-400 font-medium">✔ Admin Verified</span>
                      <span>{formattedDate}</span>
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
