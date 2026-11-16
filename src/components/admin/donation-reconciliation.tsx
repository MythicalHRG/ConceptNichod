// src/components/admin/donation-reconciliation.tsx
"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  getAdminDonationDashboard,
  adminVerifyDonationAndSetAmount,
  adminToggleHallOfPatrons,
  adminRejectDonationTransaction,
  adminUpdateDonationSettings,
  adminUpdatePatron,
  adminRemovePatron,
} from "@/app/actions/donation";
import {
  Copy,
  CheckCircle2,
  XCircle,
  Award,
  RefreshCw,
  Search,
  Settings,
  IndianRupee,
} from "lucide-react";

interface AdminTxItem {
  id: string;
  donorName: string;
  username?: string | null;
  donorEmail?: string | null;
  isAnonymous: boolean;
  utr: string;
  transactionId: string;
  message?: string;
  status: "pending" | "verified" | "rejected";
  verifiedAmount: number | null;
  patronTier: string | null;
  isPublishedToPatrons: boolean;
  adminNote?: string;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  createdAt: string;
}

export function DonationReconciliation() {
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<AdminTxItem[]>([]);
  const [patrons, setPatrons] = useState<any[]>([]);
  const [patronEdits, setPatronEdits] = useState<Record<string, {name:string;amount:string;tier:string;message:string;isAnonymous:boolean}>>({});
  const [summary, setSummary] = useState({
    pendingCount: 0,
    verifiedCount: 0,
    rejectedCount: 0,
    totalVerifiedAmount: 0,
  });

  // Per-row Admin inputs for manual ₹ amount, tier, note, and Hall of Patrons checkbox
  const [amountMap, setAmountMap] = useState<Record<string, string>>({});
  const [bankReferenceMap, setBankReferenceMap] = useState<Record<string, string>>({});
  const [recipientVpaMap, setRecipientVpaMap] = useState<Record<string, string>>({});
  const [tierMap, setTierMap] = useState<Record<string, string>>({});
  const [publishMap, setPublishMap] = useState<Record<string, boolean>>({});
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  // UPI Settings Modal/Collapsible State
  const [showSettings, setShowSettings] = useState(false);
  const [upiId, setUpiId] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("/qr.png");
  const [savingSettings, setSavingSettings] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    const res = await getAdminDonationDashboard(
      statusFilter === "all" ? undefined : statusFilter,
      search
    );
    if (res.success) {
      setTransactions((res.transactions as AdminTxItem[]) || []);
      const patronRows = (res.patrons as any[]) || [];
      setPatrons(patronRows);
      const edits: Record<string, {name:string;amount:string;tier:string;message:string;isAnonymous:boolean}> = {};
      for (const patron of patronRows) edits[patron.id] = { name:patron.name || "", amount:String(patron.amount || ""), tier:patron.tier || "SUPPORTER", message:patron.message || "", isAnonymous:Boolean(patron.isAnonymous) };
      setPatronEdits(edits);
      if (res.summary) setSummary(res.summary);
      if (res.settings) {
        setUpiId(res.settings.upiId);
        setPayeeName(res.settings.payeeName);
        setQrCodeUrl(res.settings.qrCodeUrl);
      }

      const nextAmounts: Record<string, string> = {};
      const nextTiers: Record<string, string> = {};
      const nextPublish: Record<string, boolean> = {};
      const nextNotes: Record<string, string> = {};

      for (const tx of (res.transactions as AdminTxItem[]) || []) {
        nextAmounts[tx.id] =
          tx.verifiedAmount !== null && tx.verifiedAmount !== undefined
            ? String(tx.verifiedAmount)
            : "";
        nextTiers[tx.id] = tx.patronTier || "AUTO";
        // Default to checked for pending transactions so Admin can verify & add to Hall of Patrons in 1 click
        nextPublish[tx.id] =
          tx.status === "pending" ? true : Boolean(tx.isPublishedToPatrons);
        nextNotes[tx.id] = tx.adminNote || "";
      }

      setAmountMap(nextAmounts);
      // Require fresh confirmation for each verification attempt; do not silently reuse evidence.
      setBankReferenceMap(Object.fromEntries(((res.transactions as AdminTxItem[]) || []).map((tx) => [tx.id, ""])));
      setRecipientVpaMap(Object.fromEntries(((res.transactions as AdminTxItem[]) || []).map((tx) => [tx.id, ""])));
      setTierMap(nextTiers);
      setPublishMap(nextPublish);
      setNoteMap(nextNotes);
    }
    setLoading(false);
  }, [statusFilter, search]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleVerifyAndSave = async (tx: AdminTxItem) => {
    const enteredAmount = amountMap[tx.id];
    if (!enteredAmount || Number(enteredAmount) <= 0) {
      alert("Please manually enter the ₹ amount received for this UTR before verifying.");
      return;
    }
    const bankReference = (bankReferenceMap[tx.id] || "").trim();
    const recipientVpa = (recipientVpaMap[tx.id] || "").trim();
    if (!bankReference || !recipientVpa) {
      alert("Enter the matching bank-statement UTR and recipient VPA after checking the actual bank record.");
      return;
    }

    setBusyId(tx.id);
    try {
      const res = await adminVerifyDonationAndSetAmount({
        transactionDbId: tx.id,
        verifiedAmount: Number(enteredAmount),
        bankReference,
        recipientVpa,
        publishToHallOfPatrons: Boolean(publishMap[tx.id]),
        customTier:
          tierMap[tx.id] && tierMap[tx.id] !== "AUTO" ? tierMap[tx.id] : undefined,
        adminNote: noteMap[tx.id] || "",
      });

      if (!res.success) {
        alert(res.error || "Verification failed.");
      } else {
        await loadDashboard();
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleTogglePatron = async (tx: AdminTxItem) => {
    setBusyId(tx.id);
    try {
      const res = await adminToggleHallOfPatrons(tx.id, !tx.isPublishedToPatrons);
      if (!res.success) {
        alert(res.error || "Could not update Hall of Patrons status.");
      } else {
        await loadDashboard();
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (tx: AdminTxItem) => {
    if (!confirm(`Reject UTR ${tx.utr} from ${tx.donorName}?`)) return;
    setBusyId(tx.id);
    try {
      const res = await adminRejectDonationTransaction(tx.id, noteMap[tx.id]);
      if (!res.success) {
        alert(res.error || "Failed to reject transaction.");
      } else {
        await loadDashboard();
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleSavePatron = async (patronId: string) => {
    const edit = patronEdits[patronId];
    if (!edit) return;
    setBusyId(patronId);
    try {
      const result = await adminUpdatePatron({ donorId:patronId, ...edit });
      if (!result.success) alert(result.error || "Could not update patron.");
      else await loadDashboard();
    } finally { setBusyId(null); }
  };

  const handleRemovePatron = async (patronId: string) => {
    if (!confirm("Hide this patron from the public Hall of Patrons?")) return;
    setBusyId(patronId);
    try {
      const result = await adminRemovePatron(patronId);
      if (!result.success) alert(result.error || "Could not remove patron.");
      else await loadDashboard();
    } finally { setBusyId(null); }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await adminUpdateDonationSettings({
        upiId,
        payeeName,
        qrCodeUrl,
        isEnabled: true,
      });
      if (!res.success) {
        alert(res.error || "Failed to save settings.");
      } else {
        setShowSettings(false);
      }
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Summary Cards */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white">
            UTR & Transaction ID Manual Reconciliation
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Compare the UTR, Transaction ID, credited amount, and recipient VPA against your actual bank record before verifying.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
          >
            <Settings className="w-4 h-4" />
            UPI & QR Settings
          </button>
          <button
            type="button"
            onClick={loadDashboard}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh Queue
          </button>
        </div>
      </div>

      {/* Collapsible UPI Configurator */}
      {showSettings && (
        <form
          onSubmit={handleSaveSettings}
          className="bg-slate-900 border border-indigo-500/40 rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-4 gap-4 items-end"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Official UPI ID
            </label>
            <input
              type="text"
              required
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Payee Name
            </label>
            <input
              type="text"
              required
              value={payeeName}
              onChange={(e) => setPayeeName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              QR Image Path / URL
            </label>
            <input
              type="text"
              value={qrCodeUrl}
              onChange={(e) => setQrCodeUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
            />
          </div>
          <button
            type="submit"
            disabled={savingSettings}
            className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white"
          >
            {savingSettings ? "Saving..." : "Save UPI Settings"}
          </button>
        </form>
      )}

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
          <p className="text-xs text-amber-300">Pending Verification</p>
          <p className="text-2xl font-extrabold text-amber-400">{summary.pendingCount}</p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4">
          <p className="text-xs text-emerald-300">Verified UTRs</p>
          <p className="text-2xl font-extrabold text-emerald-400">{summary.verifiedCount}</p>
        </div>
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4">
          <p className="text-xs text-rose-300">Rejected</p>
          <p className="text-2xl font-extrabold text-rose-400">{summary.rejectedCount}</p>
        </div>
        <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl p-4">
          <p className="text-xs text-indigo-300">Total Verified Money</p>
          <p className="text-2xl font-extrabold text-indigo-400">
            ₹{summary.totalVerifiedAmount.toLocaleString("en-IN")}
          </p>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-slate-900 border border-slate-800 p-4 rounded-2xl">
        <div className="flex flex-wrap gap-2">
          {[
            { id: "pending", label: "Pending Queue" },
            { id: "verified", label: "Verified & Patrons" },
            { id: "rejected", label: "Rejected" },
            { id: "all", label: "All Submissions" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                statusFilter === tab.id
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-950 text-slate-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search UTR, Transaction ID, or Name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
          />
        </div>
      </div>

      {/* Transactions List */}
      {loading ? (
        <div className="text-center py-12 text-sm text-slate-400">
          Loading UTR & Transaction ID submissions...
        </div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-12 bg-slate-900/50 border border-slate-800 rounded-2xl text-sm text-slate-400">
          No submissions found in this view.
        </div>
      ) : (
        <div className="space-y-4">
          {transactions.map((tx) => {
            const busy = busyId === tx.id;
            return (
              <div
                key={tx.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4"
              >
                {/* Top Row: Donor Info + Copyable UTR & Transaction ID */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                          tx.status === "pending"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : tx.status === "verified"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                        }`}
                      >
                        {tx.status}
                      </span>
                      <span className="text-base font-bold text-white">{tx.donorName}</span>
                      {tx.username && (
                        <span className="text-xs text-indigo-400">@{tx.username}</span>
                      )}
                      {tx.isAnonymous && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          Anonymous on Public Wall
                        </span>
                      )}
                      {tx.isPublishedToPatrons && (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold">
                          <Award className="w-3 h-3" /> In Hall of Patrons
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      Submitted: {new Date(tx.createdAt).toLocaleString("en-IN")}
                    </p>
                  </div>

                  {/* Copyable UTR & Transaction ID Boxes */}
                  <div className="flex flex-wrap gap-3">
                    <div className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 flex items-center gap-2.5">
                      <div>
                        <p className="text-[10px] uppercase font-semibold text-slate-500">
                          12-Digit UTR
                        </p>
                        <p className="font-mono text-sm font-bold text-indigo-300">{tx.utr}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(tx.utr)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                        title="Copy UTR"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 flex items-center gap-2.5">
                      <div>
                        <p className="text-[10px] uppercase font-semibold text-slate-500">
                          Transaction ID
                        </p>
                        <p className="font-mono text-sm font-bold text-emerald-300">
                          {tx.transactionId}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(tx.transactionId)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                        title="Copy Transaction ID"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {tx.message && (
                  <div className="text-xs text-slate-300 bg-slate-950/70 p-3 rounded-xl border border-slate-800">
                    <span className="text-slate-500 font-semibold">Donor Message: </span>
                    &ldquo;{tx.message}&rdquo;
                  </div>
                )}

                {/* Mandatory bank evidence confirmation before any payment is marked verified */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-amber-500/20 bg-amber-950/10 p-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Bank Statement UTR / Reference *
                    </label>
                    <input
                      type="text"
                      required
                      inputMode="numeric"
                      maxLength={60}
                      placeholder="Re-enter the UTR shown in bank records"
                      value={bankReferenceMap[tx.id] ?? ""}
                      onChange={(e) => setBankReferenceMap((prev) => ({ ...prev, [tx.id]: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Recipient VPA in Bank Record *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={100}
                      placeholder="Enter the credited recipient UPI ID"
                      value={recipientVpaMap[tx.id] ?? ""}
                      onChange={(e) => setRecipientVpaMap((prev) => ({ ...prev, [tx.id]: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-white"
                    />
                  </div>
                  <p className="sm:col-span-2 text-[11px] text-amber-200/80">
                    Verify these details in the bank&apos;s own transaction record. UTR format or a donor screenshot alone does not prove payment.
                  </p>
                </div>

                {/* Admin Manual Amount Input & Hall of Patrons Controls */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                  <div className="md:col-span-3">
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Enter Amount Received (₹) *
                    </label>
                    <div className="relative">
                      <IndianRupee className="w-3.5 h-3.5 text-emerald-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="number"
                        min={1}
                        step="1"
                        placeholder="e.g. 500"
                        value={amountMap[tx.id] ?? ""}
                        onChange={(e) =>
                          setAmountMap((prev) => ({ ...prev, [tx.id]: e.target.value }))
                        }
                        className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm font-bold text-emerald-400 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Patron Tier
                    </label>
                    <select
                      value={tierMap[tx.id] || "AUTO"}
                      onChange={(e) =>
                        setTierMap((prev) => ({ ...prev, [tx.id]: e.target.value }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
                    >
                      <option value="AUTO">Auto (From ₹ Amount)</option>
                      <option value="LEGEND">👑 Legend (₹5000+)</option>
                      <option value="DIAMOND">💎 Diamond (₹2000+)</option>
                      <option value="GOLD">🥇 Gold (₹500+)</option>
                      <option value="SILVER">🥈 Silver (₹100+)</option>
                      <option value="SUPPORTER">❤️ Supporter</option>
                    </select>
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Admin Verification Note
                    </label>
                    <input
                      type="text"
                      placeholder="Verified in GPay / Bank..."
                      value={noteMap[tx.id] ?? ""}
                      onChange={(e) =>
                        setNoteMap((prev) => ({ ...prev, [tx.id]: e.target.value }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>

                  <div className="md:col-span-4 flex flex-wrap items-center justify-end gap-2">
                    <label className="flex items-center gap-2 text-xs text-slate-300 mr-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(publishMap[tx.id])}
                        onChange={(e) =>
                          setPublishMap((prev) => ({
                            ...prev,
                            [tx.id]: e.target.checked,
                          }))
                        }
                        className="rounded border-slate-700 bg-slate-950 text-indigo-600"
                      />
                      <span>Add to Hall of Patrons</span>
                    </label>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleVerifyAndSave(tx)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-bold text-white transition"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {tx.status === "verified"
                        ? "Update ₹ & Patron"
                        : "Verify & Save ₹"}
                    </button>

                    {tx.status === "verified" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleTogglePatron(tx)}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                          tx.isPublishedToPatrons
                            ? "bg-amber-500/10 border-amber-500/40 text-amber-300"
                            : "bg-indigo-500/10 border-indigo-500/40 text-indigo-300"
                        }`}
                      >
                        {tx.isPublishedToPatrons
                          ? "Hide from Patrons"
                          : "Promote to Patrons"}
                      </button>
                    )}

                    {tx.status !== "rejected" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleReject(tx)}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-rose-950 hover:bg-rose-900 border border-rose-500/40 text-xs font-semibold text-rose-200 transition"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Reject
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <section className="space-y-4 border-t border-slate-800 pt-8">
        <div>
          <h3 className="text-xl font-extrabold text-white">Hall of Patrons Manager</h3>
          <p className="text-xs text-slate-400">Edit the confirmed amount, tier, display name and message, or hide a patron from the public list.</p>
        </div>
        {patrons.length === 0 ? (
          <p className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-400">No patron entries exist yet.</p>
        ) : patrons.map((patron) => {
          const edit = patronEdits[patron.id] || {name:patron.name || "",amount:String(patron.amount || ""),tier:patron.tier || "SUPPORTER",message:patron.message || "",isAnonymous:Boolean(patron.isAnonymous)};
          return <article key={patron.id} className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:grid-cols-2 lg:grid-cols-5">
            <label className="space-y-1 text-xs">Display name<input value={edit.name} onChange={e=>setPatronEdits(p=>({...p,[patron.id]:{...edit,name:e.target.value}}))} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/></label>
            <label className="space-y-1 text-xs">Confirmed amount (₹)<input type="number" min="1" step="0.01" value={edit.amount} onChange={e=>setPatronEdits(p=>({...p,[patron.id]:{...edit,amount:e.target.value}}))} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/></label>
            <label className="space-y-1 text-xs">Tier<select value={edit.tier} onChange={e=>setPatronEdits(p=>({...p,[patron.id]:{...edit,tier:e.target.value}}))} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"><option value="LEGEND">LEGEND</option><option value="DIAMOND">DIAMOND</option><option value="GOLD">GOLD</option><option value="SILVER">SILVER</option><option value="SUPPORTER">SUPPORTER</option></select></label>
            <label className="space-y-1 text-xs">Public message<input value={edit.message} onChange={e=>setPatronEdits(p=>({...p,[patron.id]:{...edit,message:e.target.value}}))} maxLength={250} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"/></label>
            <div className="flex flex-wrap items-end gap-2"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={edit.isAnonymous} onChange={e=>setPatronEdits(p=>({...p,[patron.id]:{...edit,isAnonymous:e.target.checked}}))}/>Anonymous</label><button type="button" disabled={busyId===patron.id} onClick={()=>void handleSavePatron(patron.id)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Save</button><button type="button" disabled={busyId===patron.id} onClick={()=>void handleRemovePatron(patron.id)} className="rounded-lg border border-rose-500/40 px-3 py-2 text-xs font-semibold text-rose-200 disabled:opacity-50">Hide</button></div>
          </article>;
        })}
      </section>
    </div>
  );
}

export default DonationReconciliation;
