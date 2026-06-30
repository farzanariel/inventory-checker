"use client";

/**
 * DealsBadge — compact summary chip rendered on each ItemRow (SPEC §22.8).
 *
 * States:
 *   - groupCount > 0: "N grps · best $X (+/-$Y)" coloured by margin sign
 *   - hasUpc && groupCount === 0: "not currently bought" (muted)
 *   - !hasUpc: "UPC pending" (muted yellow) — pre-backfill state
 */
import { CheckIcon } from "lucide-react";

import type { ItemDealsSummary } from "@/lib/api";
import { formatPrice } from "@/lib/format";

type Props = {
  summary: ItemDealsSummary;
  className?: string;
};

function formatSignedDollars(cents: number): string {
  const dollars = (Math.abs(cents) / 100).toFixed(cents % 100 === 0 ? 0 : 2);
  const sign = cents >= 0 ? "+" : "−";
  return `${sign}$${dollars}`;
}

export function DealsBadge({ summary, className = "" }: Props) {
  if (!summary.hasUpc) {
    return (
      <span
        className={`font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70 ${className}`}
        title="No UPC captured yet — run the backfill script or wait for the next worker tick"
      >
        upc pending
      </span>
    );
  }

  if (summary.groupCount === 0) {
    return (
      <span
        className={`font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70 ${className}`}
        title="No buying group is currently buying this item"
      >
        not bought
      </span>
    );
  }

  const margin = summary.marginCents;
  // "Full value" = a buying group is offering at or above the current retail
  // price → green. Anything below retail → red. Null margin (no current price
  // to compare against) falls back to muted.
  const atFullValue = margin != null && margin >= 0;
  const accent =
    margin == null
      ? "var(--color-muted-foreground)"
      : atFullValue
        ? "var(--color-status-in)"
        : "var(--color-status-error)";
  const tintBg =
    margin == null
      ? "transparent"
      : atFullValue
        ? "color-mix(in oklch, var(--color-status-in) 14%, transparent)"
        : "color-mix(in oklch, var(--color-status-error) 14%, transparent)";

  const title = summary.bestSource
    ? `Bought by ${summary.groupCount} group${summary.groupCount === 1 ? "" : "s"} · best ${formatPrice(summary.bestGroupPriceCents ?? 0)} from ${summary.bestSource}` +
      (margin != null
        ? ` (${margin >= 0 ? "+" : "−"}${formatPrice(Math.abs(margin))} vs current)`
        : "")
    : `Bought by ${summary.groupCount} group${summary.groupCount === 1 ? "" : "s"}`;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-xs md:text-sm tabular-nums tracking-tight whitespace-nowrap ${className}`}
      style={{ color: accent, backgroundColor: tintBg }}
      title={title}
      aria-label={title}
    >
      <CheckIcon className="size-3 shrink-0" aria-hidden="true" />
      {formatPrice(summary.bestGroupPriceCents ?? 0)}
    </span>
  );
}
