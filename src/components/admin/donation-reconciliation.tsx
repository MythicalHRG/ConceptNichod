// src/components/admin/donation-reconciliation.tsx
"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Rupee } from "@/components/ui/rupee-symbol";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
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
} from "lucide-react";

interface AdminTxItem {
  id: string;
  donorName: string;
  username?: string | null;
  donorEmail?: string | null;
  isAnonymous: boolean;
  utr: string;
  transactionId: string;
  claimedAmount?: number | null;
  message?: string;
  status: "pending" | "verified" | "rejected";
  verifiedAmount: number | null;
  patronTier: string | null;
  isPublishedToPatrons: boolean;
  donorRecordId?: string | null;
  adminNote?: string;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  createdAt: string;
}

export function DonationReconciliation() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<AdminTxItem[]>([]);
  const [patrons, setPatrons] = useState<any[]>([]);
  const [patronEdits, setPatronEdits] = useState<Record<string, { name: string; amount: string; tier: string; message: string; isAnonymous: boolean }>>({});
  const [summary, setSummary] = useState({
    pendingCount: 0,
    verifiedCount: 0,
    rejectedCount: 0,
    totalVerifiedAmount: 0,
  });

  // Per-row Admin inputs for manual INR amount, tier, note, and Hall of Patrons checkbox
  const [amountMap, setAmountMap] = useState<Record<string, string>>({});
  const [bankReferenceMap, setBankReferenceMap] = useState<Record<string, string>>({});
  const [recipientVpaMap, setRecipientVpaMap] = useState<Record<string, string>>({});
  const [tierMap, setTierMap] = useState<Record<string, string>>({});
  const [publishMap, setPublishMap] = useState<Record<string, boolean>>({});
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [inlineErrorMap, setInlineErrorMap] = useState<Record<string, string>>({});
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [confirmationKind, setConfirmationKind] = useState<"reject" | "remove" | null>(null);
  const [confirmationTx, setConfirmationTx] = useState<AdminTxItem | null>(null);
  const [confirmationPatronId, setConfirmationPatronId] = useState<string | null>(null);
  const [confirmationNote, setConfirmationNote] = useState("");

  // UPI Settings Collapsible State
  const [showSettings, setShowSettings] = useState(false);
  const [upiId, setUpiId] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  const latestLoadIdRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleCopyText = async (value: string, label: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copied`, description: value });
    } catch {
      toast({ variant: "destructive", title: "Copy failed", description: `Could not copy ${label}. Please copy it manually.` });
    }
  };

  const loadDashboard = useCallback(async () => {
    const loadId = ++latestLoadIdRef.current;
    setLoading(true);
    try {
      const res = await getAdminDonationDashboard(
        statusFilter === "all" ? undefined : statusFilter,
        debouncedSearch
      );
      if (loadId !== latestLoadIdRef.current) return;

      if (!res.success) {
        toast({
          variant: "destructive",
          title: "Could not load donation dashboard",
          description: res.error || "Please try again.",
        });
        return;
      }

      const txRows = (res.transactions as AdminTxItem[]) || [];
      setTransactions(txRows);
      const patronRows = (res.patrons as any[]) || [];
      setPatrons(patronRows);
      const edits: Record<string, { name: string; amount: string; tier: string; message: string; isAnonymous: boolean }> = {};
      for (const patron of patronRows) {
        edits[patron.id] = {
          name: patron.name || "",
          amount: String(patron.amount || ""),
          tier: patron.tier || "SUPPORTER",
          message: patron.message || "",
          isAnonymous: Boolean(patron.isAnonymous),
        };
      }
      setPatronEdits(edits);
      if (res.summary) setSummary(res.summary);
      if (res.settings) {
        setUpiId(res.settings.upiId || "");
        setPayeeName(res.settings.payeeName || "ConceptNichod");
      }

      const nextAmounts: Record<string, string> = {};
      const nextTiers: Record<string, string> = {};
      const nextPublish: Record<string, boolean> = {};
      const nextNotes: Record<string, string> = {};

      for (const tx of txRows) {
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
      setBankReferenceMap(Object.fromEntries(txRows.map((tx) => [tx.id, ""])));
      setRecipientVpaMap(Object.fromEntries(txRows.map((tx) => [tx.id, ""])));
      setTierMap(nextTiers);
      setPublishMap(nextPublish);
      setNoteMap(nextNotes);
    } catch (error) {
      if (loadId !== latestLoadIdRef.current) return;
      toast({
        variant: "destructive",
        title: "Could not load donation dashboard",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      if (loadId === latestLoadIdRef.current) {
        setLoading(false);
      }
    }
  }, [statusFilter, debouncedSearch, toast]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleVerifyAndSave = async (tx: AdminTxItem) => {
    const rawAmount = (amountMap[tx.id] || "").trim();
    const parsedAmount = Number(rawAmount);
    if (!rawAmount || !Number.isFinite(parsedAmount) || parsedAmount < 1) {
      setInlineErrorMap((prev) => ({ ...prev, [tx.id]: "Enter a valid amount received before verifying." }));
      toast({
        variant: "destructive",
        title: "Amount required",
        description: "Please manually enter a valid INR amount received for this UTR before verifying.",
      });
      return;
    }
    const bankReference = (bankReferenceMap[tx.id] || "").trim();
    const recipientVpa = (recipientVpaMap[tx.id] || "").trim();
    if (!bankReference || !recipientVpa) {
      setInlineErrorMap((prev) => ({ ...prev, [tx.id]: "Enter the bank-statement UTR and credited recipient VPA." }));
      toast({
        variant: "destructive",
        title: "Bank evidence required",
        description: "Enter the matching bank-statement UTR and recipient VPA after checking the actual bank record.",
      });
      return;
    }

    setBusyId(tx.id);
    try {
      setInlineErrorMap((prev) => ({ ...prev, [tx.id]: "" }));
      const res = await adminVerifyDonationAndSetAmount({
        transactionDbId: tx.id,
        verifiedAmount: parsedAmount,
        bankReference,
        recipientVpa,
        publishToHallOfPatrons: Boolean(publishMap[tx.id]),
        customTier:
          tierMap[tx.id] && tierMap[tx.id] !== "AUTO" ? tierMap[tx.id] : undefined,
        adminNote: noteMap[tx.id] || "",
      });

      if (!res.success) {
        setInlineErrorMap((prev) => ({ ...prev, [tx.id]: res.error || "Verification failed." }));
        toast({
          variant: "destructive",
          title: "Verification failed",
          description: res.error || "Verification failed.",
        });
      } else {
        toast({ title: "Donation verified", description: res.message });
        await loadDashboard();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Please try again.";
      setInlineErrorMap((prev) => ({ ...prev, [tx.id]: message }));
      toast({ variant: "destructive", title: "Donation mutation failed", description: message });
    } finally {
      setBusyId(null);
    }
  };

  const handleTogglePatron = async (tx: AdminTxItem) => {
    setBusyId(tx.id);
    try {
      const res = await adminToggleHallOfPatrons(tx.id, !tx.isPublishedToPatrons);
      if (!res.success) {
        toast({
          variant: "destructive",
          title: "Update failed",
          description: res.error || "Could not update Hall of Patrons status.",
        });
      } else {
        toast({ title: "Hall of Patrons updated", description: res.message });
        await loadDashboard();
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Donation mutation failed",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = (tx: AdminTxItem) => {
    setConfirmationKind("reject"); setConfirmationTx(tx); setConfirmationPatronId(null);
    setConfirmationNote(noteMap[tx.id] || ""); setConfirmationOpen(true);
  };

  const handleSavePatron = async (patronId: string) => {
    const edit = patronEdits[patronId];
    if (!edit) return;
    setBusyId(patronId);
    try {
      const result = await adminUpdatePatron({ donorId: patronId, ...edit });
      if (!result.success) {
        toast({
          variant: "destructive",
          title: "Patron update failed",
          description: result.error || "Could not update patron.",
        });
      } else {
        toast({ title: "Patron updated", description: result.message });
        await loadDashboard();
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Donation mutation failed",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleRemovePatron = (patronId: string) => {
    setConfirmationKind("remove"); setConfirmationTx(null); setConfirmationPatronId(patronId);
    setConfirmationNote(""); setConfirmationOpen(true);
  };

  const confirmPendingAction = async () => {
    if (confirmationKind === "reject" && confirmationTx) {
      const tx = confirmationTx; setBusyId(tx.id);
      try {
        const res = await adminRejectDonationTransaction(tx.id, confirmationNote);
        if (!res.success) toast({ variant: "destructive", title: "Rejection failed", description: res.error || "Failed to reject transaction." });
        else { toast({ title: "Transaction rejected", description: res.message }); setConfirmationOpen(false); await loadDashboard(); }
      } catch (error) { toast({ variant: "destructive", title: "Donation mutation failed", description: error instanceof Error ? error.message : "Please try again." }); }
      finally { setBusyId(null); }
    } else if (confirmationKind === "remove" && confirmationPatronId) {
      const id = confirmationPatronId; setBusyId(id);
      try {
        const result = await adminRemovePatron(id);
        if (!result.success) toast({ variant: "destructive", title: "Could not hide patron", description: result.error || "Could not remove patron." });
        else { toast({ title: "Patron hidden", description: result.message }); setConfirmationOpen(false); await loadDashboard(); }
      } catch (error) { toast({ variant: "destructive", title: "Donation mutation failed", description: error instanceof Error ? error.message : "Please try again." }); }
      finally { setBusyId(null); }
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await adminUpdateDonationSettings({
        upiId,
        payeeName,
        qrCodeUrl: "",
      });
      if (!res.success) {
        toast({
          variant: "destructive",
          title: "Failed to save settings",
          description: res.error || "Failed to save settings.",
        });
      } else {
        toast({ title: "UPI settings saved", description: res.message });
        setShowSettings(false);
        await loadDashboard();
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Donation mutation failed",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <>
    <div className="space-y-6 min-w-0">
      {/* Header & Summary Cards */}
      <div className="rounded-2xl border border-emerald-500/30 bg-card p-4">
        <h3 className="text-sm font-bold text-foreground">Donations: Permanently Enabled</h3>
        <span className="inline-flex mt-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">LIVE</span>
        <p className="mt-2 text-xs text-muted-foreground">{upiId ? "Official UPI ID: " + upiId : "Official UPI ID not configured yet — configure it in Admin Panel → Donations."}</p>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-foreground">
            UTR & Transaction ID Manual Reconciliation
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Compare the UTR, Transaction ID, credited amount, and recipient VPA against your actual bank record before verifying.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <a
            href="/donate"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-background hover:bg-muted text-xs font-semibold text-foreground"
          >
            View Public Donation Page
          </a>
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-xs font-semibold text-foreground"
          >
            <Settings className="w-4 h-4" />
            UPI Settings
          </button>
          <button
            type="button"
            onClick={loadDashboard}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold"
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
          className="bg-card border border-indigo-500/40 rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-4 gap-4 items-end"
        >
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Official UPI ID
            </label>
            <input
              type="text"
              required
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="yourname@upi"
              className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-foreground"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Payee Name
            </label>
            <input
              type="text"
              required
              value={payeeName}
              onChange={(e) => setPayeeName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-foreground"
            />
          </div>
          <div className="py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-300">Donations permanently enabled (LIVE)</div>
          <button
            type="submit"
            disabled={savingSettings}
            className="py-2 px-4 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 text-xs font-bold"
          >
            {savingSettings ? "Saving..." : "Save UPI Settings"}
          </button>
        </form>
      )}

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
          <p className="text-xs text-amber-700 dark:text-amber-300">Pending Verification</p>
          <p className="text-2xl font-extrabold text-amber-400">{summary.pendingCount}</p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4">
          <p className="text-xs text-emerald-700 dark:text-emerald-300">Verified UTRs</p>
          <p className="text-2xl font-extrabold text-emerald-400">{summary.verifiedCount}</p>
        </div>
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4">
          <p className="text-xs text-rose-700 dark:text-rose-300">Rejected</p>
          <p className="text-2xl font-extrabold text-rose-400">{summary.rejectedCount}</p>
        </div>
        <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl p-4">
          <p className="text-xs text-indigo-700 dark:text-indigo-300">Total Verified Money</p>
          <p className="text-2xl font-extrabold text-indigo-400">
            <Rupee amount={summary.totalVerifiedAmount} />
          </p>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-card border border-border p-4 rounded-2xl">
        <div className="flex flex-wrap gap-2">
          {[
            { id: "pending", label: `Pending (${summary.pendingCount})` },
            { id: "verified", label: `Verified (${summary.verifiedCount})` },
            { id: "rejected", label: `Rejected (${summary.rejectedCount})` },
            { id: "all", label: "All" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                statusFilter === tab.id
                  ? "bg-indigo-600 text-foreground"
                  : "bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search UTR, Transaction ID, or Name..."
            value={search}
            maxLength={100}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3.5 py-1.5 rounded-xl bg-background border border-border text-xs text-foreground"
          />
        </div>
      </div>

      {/* Transactions List */}
      {loading ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          Loading UTR & Transaction ID submissions...
        </div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-12 bg-card/50 border border-border rounded-2xl text-sm text-muted-foreground">
          No submissions found in this view.
        </div>
      ) : (
        <div className="space-y-4">
          {transactions.map((tx) => {
            const busy = busyId === tx.id;
            const needsSyncRecovery = tx.status === "verified" && tx.isPublishedToPatrons && !tx.donorRecordId;
            const canVerifyNow = tx.status === "pending" || needsSyncRecovery;

            return (
              <div
                key={tx.id}
                className="bg-card border border-border rounded-2xl p-5 space-y-4"
              >
                {/* Top Row: Donor Info + Copyable UTR & Transaction ID */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                          tx.status === "pending"
                            ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                            : tx.status === "verified"
                            ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                            : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                        }`}
                      >
                        {tx.status}
                      </span>
                      <span className="text-base font-bold text-foreground">{tx.donorName || (tx.username ? `@${tx.username}` : "Unnamed Donor")}</span>
                      {tx.username && (
                        <span className="text-xs text-indigo-400">@{tx.username}</span>
                      )}
                      {tx.isAnonymous && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-secondary text-foreground">
                          Anonymous on Public Wall
                        </span>
                      )}
                      {tx.isPublishedToPatrons && (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 font-semibold">
                          <Award className="w-3 h-3" /> In Hall of Patrons
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Submitted: {new Date(tx.createdAt).toLocaleString("en-IN")}
                    </p>
                  </div>

                  {/* Copyable UTR & Transaction ID Boxes */}
                  <div className="flex flex-wrap gap-3">
                    <div className="bg-background border border-border rounded-xl px-3.5 py-2 flex items-center gap-2.5">
                      <div>
                        <p className="text-[10px] uppercase font-semibold text-muted-foreground">
                          12-Digit UTR
                        </p>
                        <p className="font-mono text-sm font-bold text-indigo-300">{tx.utr}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyText(tx.utr, "UTR")}
                        className="p-1.5 rounded-lg bg-secondary hover:bg-secondary text-foreground"
                        title="Copy UTR"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="bg-background border border-border rounded-xl px-3.5 py-2 flex items-center gap-2.5">
                      <div>
                        <p className="text-[10px] uppercase font-semibold text-muted-foreground">
                          Transaction ID
                        </p>
                        <p className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-300">
                          {tx.transactionId?.trim() || <span className="text-muted-foreground font-normal">Not provided (legacy)</span>}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyText(tx.transactionId, "Transaction ID")}
                        disabled={!tx.transactionId?.trim()}
                        className="p-1.5 rounded-lg bg-secondary hover:bg-secondary text-foreground"
                        title="Copy Transaction ID"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {needsSyncRecovery && (
                  <div role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                    Donor synchronization incomplete. Confirm the original bank evidence below, then retry the donor sync.
                  </div>
                )}

                {tx.claimedAmount !== null && tx.claimedAmount !== undefined && (
                  <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/5 px-3 py-2 text-xs">
                    <span className="font-semibold text-foreground">Donor-entered QR amount: </span>
                    <Rupee amount={tx.claimedAmount} />
                    <span className="ml-2 text-muted-foreground">Reference only — verify the actual credited amount in the bank record below.</span>
                  </div>
                )}

                {tx.message && (
                  <div className="min-w-0 break-words overflow-hidden text-xs text-foreground bg-background/70 p-3 rounded-xl border border-border">
                    <span className="text-muted-foreground font-semibold">Donor Message: </span>
                    &ldquo;{tx.message}&rdquo;
                  </div>
                )}

                {!upiId && canVerifyNow && <div role="alert" className="sm:col-span-2 rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">Official UPI ID is not configured. <button type="button" onClick={() => setShowSettings(true)} className="underline font-semibold">Open UPI Settings</button> before verifying.</div>}

                {inlineErrorMap[tx.id] && <div role="alert" className="rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs text-destructive">{inlineErrorMap[tx.id]}</div>}

                {tx.status !== "pending" && (
                  <div className="min-w-0 break-words rounded-xl border border-border bg-muted/30 p-3 text-xs space-y-1">
                    {tx.status === "verified" && (
                      <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                        Verified amount: <Rupee amount={tx.verifiedAmount ?? 0} /> · Patron tier: {tx.patronTier || "SUPPORTER"}
                      </p>
                    )}
                    <p className="text-muted-foreground">
                      {tx.status === "verified" ? "Verified" : "Rejected"}: {tx.verifiedAt ? new Date(tx.verifiedAt).toLocaleString("en-IN") : "Timestamp unavailable"}
                      {tx.verifiedBy ? ` · By ${tx.verifiedBy}` : ""}
                    </p>
                    {tx.adminNote && <p className="break-words"><span className="font-semibold">Admin note:</span> {tx.adminNote}</p>}
                  </div>
                )}

                {/* Mandatory bank evidence confirmation before any payment is marked verified */}
                {canVerifyNow && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-amber-500/20 bg-amber-950/10 p-3">
                    <div>
                      <label className="block text-xs font-semibold text-foreground mb-1">
                        Bank Statement UTR / Reference *
                      </label>
                      <button type="button" onClick={() => setBankReferenceMap((prev) => ({ ...prev, [tx.id]: tx.utr }))} className="mb-1 text-[11px] text-primary underline">Matches Submitted UTR</button>
                      <input
                        type="text"
                        required
                        inputMode="numeric"
                        maxLength={60}
                        placeholder="Re-enter the UTR shown in bank records"
                        value={bankReferenceMap[tx.id] ?? ""}
                        onChange={(e) => setBankReferenceMap((prev) => ({ ...prev, [tx.id]: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl bg-background border border-input text-xs font-mono text-foreground"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-foreground mb-1">
                        Recipient VPA in Bank Record *
                      </label>
                      <button type="button" disabled={!upiId} onClick={() => setRecipientVpaMap((prev) => ({ ...prev, [tx.id]: upiId }))} className="mb-1 text-[11px] text-primary underline disabled:opacity-50">Use Official UPI ID</button>
                      <input
                        type="text"
                        required
                        maxLength={100}
                        placeholder="Enter the credited recipient UPI ID"
                        value={recipientVpaMap[tx.id] ?? ""}
                        onChange={(e) => setRecipientVpaMap((prev) => ({ ...prev, [tx.id]: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl bg-background border border-input text-xs font-mono text-foreground"
                      />
                    </div>
                    <p className="sm:col-span-2 text-[11px] text-amber-200/80">
                      Verify these details in the bank&apos;s own transaction record. UTR format or a donor screenshot alone does not prove payment.
                    </p>
                  </div>
                )}

                {/* Admin Manual Amount Input & Hall of Patrons Controls */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                  <div className="md:col-span-3">
                    <label className="block text-xs font-semibold text-foreground mb-1">
                      Enter Amount Received (<Rupee />) *
                    </label>
                    <div className="relative">
                      <Rupee className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-300 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="number"
                        min={1}
                        step="1"
                        disabled={!canVerifyNow || needsSyncRecovery}
                        placeholder="e.g. 500"
                        value={amountMap[tx.id] ?? ""}
                        onChange={(e) =>
                          setAmountMap((prev) => ({ ...prev, [tx.id]: e.target.value }))
                        }
                        className="w-full pl-8 pr-3 py-2 rounded-xl bg-background border border-input text-sm font-bold text-emerald-400 disabled:opacity-60 focus:outline-none focus:border-emerald-500"
                      />
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {[50, 100, 250, 500, 1000].map((value) => <button key={value} type="button" disabled={!canVerifyNow || needsSyncRecovery} onClick={() => setAmountMap((prev) => ({ ...prev, [tx.id]: String(value) }))} className="rounded-full border border-border px-2.5 py-1 text-[11px] hover:bg-muted disabled:opacity-50">{value}</button>)}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">Suggested tier: {Number(amountMap[tx.id] || 0) >= 5000 ? "Legend" : Number(amountMap[tx.id] || 0) >= 2000 ? "Diamond" : Number(amountMap[tx.id] || 0) >= 500 ? "Gold" : Number(amountMap[tx.id] || 0) >= 100 ? "Silver" : "Supporter"}</p>
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-foreground mb-1">
                      Patron Tier
                    </label>
                    <select
                      disabled={!canVerifyNow || needsSyncRecovery}
                      value={tierMap[tx.id] || "AUTO"}
                      onChange={(e) =>
                        setTierMap((prev) => ({ ...prev, [tx.id]: e.target.value }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-background border border-input text-xs text-foreground disabled:opacity-60"
                    >
                      <option value="AUTO">Auto (From INR Amount)</option>
                      <option value="LEGEND">👑 Legend (INR 5,000+)</option>
                      <option value="DIAMOND">💎 Diamond (INR 2,000+)</option>
                      <option value="GOLD">🥇 Gold (INR 500+)</option>
                      <option value="SILVER">🥈 Silver (INR 100+)</option>
                      <option value="SUPPORTER">❤️ Supporter</option>
                    </select>
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-xs font-semibold text-foreground mb-1">
                      Admin Verification Note
                    </label>
                    <input
                      type="text"
                      placeholder="Verified in GPay / Bank..."
                      value={noteMap[tx.id] ?? ""}
                      onChange={(e) =>
                        setNoteMap((prev) => ({ ...prev, [tx.id]: e.target.value }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-foreground"
                    />
                  </div>

                  <div className="md:col-span-4 flex flex-wrap items-center justify-end gap-2">
                    {canVerifyNow && (
                      <>
                        <label className="flex items-center gap-2 text-xs text-foreground mr-2 cursor-pointer">
                          <Switch checked={Boolean(publishMap[tx.id])} disabled={needsSyncRecovery} onCheckedChange={(checked) => setPublishMap((prev) => ({ ...prev, [tx.id]: checked }))} aria-label="Add to Hall of Patrons" />
                          <span>Add to Hall of Patrons</span>
                        </label>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleVerifyAndSave(tx)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-bold text-foreground transition"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {needsSyncRecovery ? "Retry Donor Sync" : "Verify & Save INR"}
                        </button>
                      </>
                    )}

                    {tx.status === "verified" && !needsSyncRecovery && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleTogglePatron(tx)}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                          tx.isPublishedToPatrons
                            ? "bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-300"
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
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs font-semibold transition"
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

      <section className="space-y-4 border-t border-border pt-8">
        <div>
          <h3 className="text-xl font-extrabold text-foreground">Hall of Patrons Manager</h3>
          <p className="text-xs text-muted-foreground">Edit the confirmed amount, tier, display name and message, or hide a patron from the public list.</p>
        </div>
        {patrons.length === 0 ? (
          <p className="rounded-xl border border-border bg-card/50 p-4 text-sm text-muted-foreground">No patron entries exist yet.</p>
        ) : patrons.map((patron) => {
          const edit = patronEdits[patron.id] || {
            name: patron.name || "",
            amount: String(patron.amount || ""),
            tier: patron.tier || "SUPPORTER",
            message: patron.message || "",
            isAnonymous: Boolean(patron.isAnonymous),
          };
          return (
            <article key={patron.id} className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
              <label className="space-y-1 text-xs">
                <span className="flex items-center gap-2">
                  Display name
                  {!patron.isVisible && (
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                      Hidden
                    </span>
                  )}
                </span>
                <input
                  value={edit.name}
                  onChange={(e) => setPatronEdits((p) => ({ ...p, [patron.id]: { ...edit, name: e.target.value } }))}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1 text-xs">
                Confirmed amount (<Rupee />)
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={edit.amount}
                  onChange={(e) => setPatronEdits((p) => ({ ...p, [patron.id]: { ...edit, amount: e.target.value } }))}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1 text-xs">
                Tier
                <select
                  value={edit.tier}
                  onChange={(e) => setPatronEdits((p) => ({ ...p, [patron.id]: { ...edit, tier: e.target.value } }))}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="LEGEND">LEGEND</option>
                  <option value="DIAMOND">DIAMOND</option>
                  <option value="GOLD">GOLD</option>
                  <option value="SILVER">SILVER</option>
                  <option value="SUPPORTER">SUPPORTER</option>
                </select>
              </label>
              <label className="space-y-1 text-xs">
                Public message
                <input
                  value={edit.message}
                  onChange={(e) => setPatronEdits((p) => ({ ...p, [patron.id]: { ...edit, message: e.target.value } }))}
                  maxLength={250}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={edit.isAnonymous}
                    onChange={(e) => setPatronEdits((p) => ({ ...p, [patron.id]: { ...edit, isAnonymous: e.target.checked } }))}
                  />
                  Anonymous
                </label>
                <button
                  type="button"
                  disabled={busyId === patron.id}
                  onClick={() => void handleSavePatron(patron.id)}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-foreground disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  disabled={busyId === patron.id}
                  onClick={() => void handleRemovePatron(patron.id)}
                  className="rounded-lg border border-rose-500/40 px-3 py-2 text-xs font-semibold text-rose-200 disabled:opacity-50"
                >
                  Hide
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </div>
      <Dialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmationKind === "reject" ? "Reject donation?" : "Hide patron?"}</DialogTitle>
            <DialogDescription>
              {confirmationKind === "reject" && confirmationTx
                ? <>Reject {confirmationTx.donorName || (confirmationTx.username ? `@${confirmationTx.username}` : "Unnamed Donor")} (UTR {confirmationTx.utr})?</>
                : "This patron will be hidden from the public Hall of Patrons."}
            </DialogDescription>
          </DialogHeader>
          {confirmationKind === "reject" && <>
            <div className="flex flex-wrap gap-2">
              {["UTR not found in bank statement", "Duplicate / invalid reference", "Payment not received", "Test / accidental submission"].map((reason) => (
                <button key={reason} type="button" onClick={() => setConfirmationNote(reason)} className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-muted">{reason}</button>
              ))}
            </div>
            <Textarea value={confirmationNote} onChange={(e) => setConfirmationNote(e.target.value)} maxLength={500} placeholder="Optional rejection note" />
          </>}
          <DialogFooter>
            <button type="button" onClick={() => setConfirmationOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm">Cancel</button>
            <button type="button" disabled={Boolean(busyId)} onClick={() => void confirmPendingAction()} className="rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50">
              {busyId ? "Processing..." : confirmationKind === "reject" ? "Confirm Reject" : "Confirm Hide"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default DonationReconciliation;
