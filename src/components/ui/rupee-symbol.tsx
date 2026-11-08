import React from "react";
import { IndianRupee } from "lucide-react";

interface RupeeProps {
  className?: string;
  amount?: number | string;
}

/**
 * Standardized Indian Rupee symbol (₹ / U+20B9) component.
 * Uses inline vector IndianRupee SVG with cross-platform system font fallbacks
 * (Segoe UI on Windows, -apple-system on Apple, Roboto/Noto Sans on Android/Linux)
 * to prevent font-clipping, Russian ruble substitution, or misaligned baselines.
 */
export function Rupee({ className = "w-3.5 h-3.5", amount }: RupeeProps) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <IndianRupee
        aria-hidden="true"
        className={`inline-block select-none font-rupee shrink-0 ${className}`}
        style={{
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", sans-serif',
        }}
      />
      <span className="sr-only">₹</span>
      {amount !== undefined && (
        <span className="tabular-nums">
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
