import React from "react";

interface RupeeProps {
  className?: string;
  amount?: number | string;
}

/**
 * Standardized Indian Rupee symbol (₹ / U+20B9) component.
 * Uses a robust cross-platform font stack (Segoe UI on Windows, -apple-system on Apple, Roboto/Noto Sans on Android/Linux)
 * to prevent font-clipping, tofu boxes, or misaligned baselines.
 */
export function Rupee({ className = "", amount }: RupeeProps) {
  return (
    <span className="inline-flex items-baseline">
      <span
        aria-hidden="true"
        className={`font-rupee inline-block select-none ${className}`}
        style={{
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", sans-serif',
          fontWeight: "inherit",
        }}
      >
        ₹
      </span>
      {amount !== undefined && (
        <span className="ml-0.5 font-variant-numeric tabular-nums">
          {typeof amount === "number"
            ? amount.toLocaleString("en-IN")
            : amount}
        </span>
      )}
    </span>
  );
}

export function formatINR(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "0";
  return num.toLocaleString("en-IN");
}
