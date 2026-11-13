"use client";

import { useEffect, useState } from "react";
import {
  getPendingDonationsAdminAction,
  reconcileDonationManuallyAction,
} from "@/app/actions/donation";

type PendingDonation = {
  utr: string;
  username: string;
  claimedAmount: number;
  message: string;
  submittedAt: string;
};

export function DonationReconciliation() {
  const [items, setItems] = useState<PendingDonation[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [vpas, setVpas] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      setItems(await getPendingDonationsAdminAction());
    } catch (error: any) {
      setNotice(error?.message || "Could not load pending donations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function verify(item: PendingDonation) {
    setBusy(item.utr);
    setNotice("");
    try {
      const result = await reconcileDonationManuallyAction({
        utr: item.utr,
        receivedAmount: Number(amounts[item.utr]),
        recipientVpa: vpas[item.utr] || "",
      });
      setNotice(result.message);
      await refresh();
    } catch (error: any) {
      setNotice(error?.message || "Reconciliation failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">UPI donation reconciliation</h2>
        <p className="text-sm text-muted-foreground">
          Verify each claim against the bank account transaction record before approving it.
          Never approve using the donor's screenshot or entered amount alone.
        </p>
      </div>
      {notice && <p role="status" className="rounded-md border p-3 text-sm">{notice}</p>}
      {loading ? <p>Loading pending submissions…</p> : items.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">No pending UTR submissions.</p>
      ) : items.map((item) => (
        <article key={item.utr} className="rounded-xl border p-4 space-y-3">
          <div className="flex flex-wrap justify-between gap-2">
            <div>
              <p className="font-semibold">@{item.username}</p>
              <p className="font-mono text-sm">{item.utr}</p>
              <p className="text-xs text-muted-foreground">Submitted {new Date(item.submittedAt).toLocaleString()}</p>
            </div>
            <p className="font-bold">Claimed ₹{item.claimedAmount.toFixed(2)}</p>
          </div>
          {item.message && <p className="text-sm text-muted-foreground">{item.message}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span>Actual credited amount (₹)</span>
              <input
                type="number"
                min="1"
                step="0.01"
                value={amounts[item.utr] || ""}
                onChange={(e) => setAmounts((old) => ({ ...old, [item.utr]: e.target.value }))}
                className="w-full rounded-md border bg-background px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Recipient VPA shown by bank</span>
              <input
                type="text"
                value={vpas[item.utr] || ""}
                onChange={(e) => setVpas((old) => ({ ...old, [item.utr]: e.target.value }))}
                className="w-full rounded-md border bg-background px-3 py-2"
                placeholder="recipient@bank"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={busy === item.utr || !amounts[item.utr] || !vpas[item.utr]}
            onClick={() => void verify(item)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy === item.utr ? "Reconciling…" : "Confirm bank credit"}
          </button>
          <p className="text-xs text-muted-foreground">
            Approval requires an exact amount and recipient match with the configured donation VPA.
          </p>
        </article>
      ))}
    </section>
  );
}
