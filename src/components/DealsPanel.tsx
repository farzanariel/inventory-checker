"use client";

/**
 * DealsPanel — per-group breakdown of buying-group offers for one item
 * (SPEC §22.8). Rendered inside EditItemDialog.
 *
 * v1 surfaces the snapshot table only. The history sparkline (per-group
 * price trend over 14 days) is deferred — `GET /api/items/:id/deals/history`
 * is wired and tested, but the chart UI lands in a follow-up.
 */
import type { ItemWithDeals } from "@/lib/api";
import { formatPrice, formatRelativeTime } from "@/lib/format";

type Props = {
  item: ItemWithDeals;
};

export function DealsPanel({ item }: Props) {
  const { deals, dealsSummary } = item;

  if (!dealsSummary.hasUpc) {
    return (
      <section className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        UPC hasn&apos;t been captured for this item yet. The worker will
        backfill it on its next sweep — or run{" "}
        <code className="font-mono text-[11px]">pnpm tsx scripts/backfill-upc.ts</code>{" "}
        manually.
      </section>
    );
  }

  if (deals.length === 0) {
    return (
      <section className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        No buying group is currently buying this item.
        {dealsSummary.lastSyncAt != null
          ? ` Last synced ${formatRelativeTime(dealsSummary.lastSyncAt)}.`
          : ""}
      </section>
    );
  }

  const currentCents = item.currentPriceCents;

  return (
    <section className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Groups ({deals.length})
        </h3>
        {dealsSummary.lastSyncAt != null ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            synced {formatRelativeTime(dealsSummary.lastSyncAt)}
          </span>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-2 py-1 text-left font-medium">Group</th>
              <th className="px-2 py-1 text-right font-medium">Price</th>
              <th className="px-2 py-1 text-right font-medium">Margin</th>
              <th className="px-2 py-1 text-center font-medium w-6"></th>
              <th className="px-2 py-1 text-right font-medium w-10"></th>
            </tr>
          </thead>
          <tbody>
            {deals.map((d) => {
              const margin =
                currentCents != null ? d.groupPriceCents - currentCents : null;
              const marginColor =
                margin == null
                  ? "var(--color-muted-foreground)"
                  : margin > 0
                    ? "var(--color-status-in)"
                    : "var(--color-status-error)";
              return (
                <tr
                  key={d.source}
                  className="border-t border-border first:border-t-0"
                >
                  <td
                    className="px-2 py-1 font-medium truncate max-w-[180px]"
                    title={d.source}
                  >
                    {d.displayName}
                  </td>
                  <td className="px-2 py-1 text-right font-mono tabular-nums">
                    {formatPrice(d.groupPriceCents)}
                  </td>
                  <td
                    className="px-2 py-1 text-right font-mono tabular-nums"
                    style={{ color: marginColor }}
                  >
                    {margin == null
                      ? "—"
                      : `${margin >= 0 ? "+" : "−"}${formatPrice(Math.abs(margin))}`}
                  </td>
                  <td className="px-2 py-1 text-center">
                    <span
                      className="inline-block size-1.5 rounded-full align-middle"
                      style={{
                        backgroundColor: d.isAvailable
                          ? "var(--color-status-in)"
                          : "var(--color-status-out)",
                      }}
                      aria-label={d.isAvailable ? "available" : "unavailable"}
                      title={d.isAvailable ? "available" : "unavailable"}
                    />
                  </td>
                  <td className="px-2 py-1 text-right">
                    {d.dealUrl ? (
                      <a
                        href={d.dealUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] underline-offset-2 hover:underline"
                      >
                        view
                      </a>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
