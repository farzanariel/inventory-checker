"use client";

/**
 * DealsBadge — compact summary chip rendered on each ItemRow (SPEC §22.8).
 *
 * States:
 *   - groupCount > 0: "N grps · best $X (+/-$Y)" coloured by margin sign
 *   - hasUpc && groupCount === 0: "not currently bought" (muted)
 *   - !hasUpc: "UPC pending" (muted yellow) — pre-backfill state
 */
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
  const marginColor =
    margin == null
      ? "var(--color-muted-foreground)"
      : margin > 0
        ? "var(--color-status-in)"
        : "var(--color-status-error)";

  const title = summary.bestSource
    ? `Best price ${formatPrice(summary.bestGroupPriceCents ?? 0)} from ${summary.bestSource}` +
      (margin != null
        ? ` (${margin >= 0 ? "+" : "−"}${formatPrice(Math.abs(margin))} vs current)`
        : "")
    : undefined;

  return (
    <span
      className={`font-mono text-sm tabular-nums tracking-tight whitespace-nowrap ${className}`}
      style={{ color: marginColor }}
      title={title}
    >
      {formatPrice(summary.bestGroupPriceCents ?? 0)}
    </span>
  );
}
