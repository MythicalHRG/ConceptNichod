import React from "react";

interface RupeeProps {
  className?: string;
  amount?: number | string;
}

/**
 * Shared Indian Rupee symbol and INR amount renderer.
 * Uses the actual U+20B9 glyph with platform font fallbacks rather than a
 * currency icon that can look inconsistent across screen densities.
 */
export function Rupee({ className = "text-sm leading-none", amount }: RupeeProps) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap" data-currency="inr">
      <span
        aria-hidden="true"
        className={`font-rupee inline-block shrink-0 leading-none ${className}`}
        style={{
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", sans-serif',
        }}
      >
        ₹
      </span>
      {amount !== undefined && (
        <span className="tabular-nums">{formatINR(amount)}</span>
      )}
    </span>
  );
}

/** Formats numeric values using Indian digit grouping without adding a symbol. */
export function formatINR(amount: number | string): string {
  const raw = typeof amount === "string" ? amount.trim() : amount;
  if (raw === "") return "0";
  const num = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(num)) return "0";
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(num);
}
