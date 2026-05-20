"use client";

/**
 * ItemRow — single dense row in the watchlist.
 *
 * Layout (SPEC §11):
 *  Desktop: one row line-1 = name … price · STATUS · ⋯
 *           line-2 = SKU · interval · last-checked
 *  Mobile:  line-1 = name (truncated) … ⋯
 *           line-2 = price · STATUS · SKU · interval · last (mono, secondary)
 *
 * Polish:
 *  - tabular-nums on every numeric value
 *  - IN STOCK gets a 1px-wide × 12px-tall left accent bar
 *  - hover reveals ⋯ on desktop; always visible on mobile
 *  - row-flash animation when lastCheckedAt changes (key-driven)
 *  - active:bg lift on touch
 */

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { GripVerticalIcon } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusDot } from "@/components/StatusDot";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { EditItemDialog } from "@/components/EditItemDialog";
import { ItemHistoryDialog } from "@/components/ItemHistoryDialog";
import { useIsDesktop } from "@/hooks/use-media-query";
import { checkNow, patchItem, type ItemWithDeals } from "@/lib/api";
import type { Item } from "@/lib/db/schema";
import { DealsBadge } from "@/components/DealsBadge";
import {
  formatInterval,
  formatPrice,
  formatRelativeTime,
} from "@/lib/format";
import type {
  HealthStatus,
  StockStatus,
} from "@/components/StatusDot";

type Props = {
  item: ItemWithDeals;
  onChanged: () => void;
  /** When false, drag handle is rendered as an inert spacer. */
  draggable?: boolean;
};

function badgeLabel(item: Item): string {
  if (item.healthStatus === "ERROR") return "ERROR";
  if (item.healthStatus === "DEGRADED") return "DEGRADED";
  switch (item.lastStockStatus) {
    case "IN_STOCK":
      return "IN STOCK";
    case "OUT_OF_STOCK":
      return "OOS";
    case "UNKNOWN":
      return "UNKNOWN";
    default:
      return "—";
  }
}

function badgeColorVar(item: Item): string {
  if (item.healthStatus === "ERROR") return "var(--color-status-error)";
  if (item.healthStatus === "DEGRADED") return "var(--color-status-degraded)";
  if (item.lastStockStatus === "IN_STOCK") return "var(--color-status-in)";
  return "var(--color-status-out)";
}

export function ItemRow({ item, onChanged, draggable = true }: Props) {
  const sortable = useSortable({ id: item.id, disabled: !draggable });
  const dragStyle = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.5 : undefined,
  } as const;
  const [editOpen, setEditOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const lastCheckedRef = useRef(item.lastCheckedAt);
  const isDesktop = useIsDesktop();

  const isPaused = item.enabled === 0;
  const stockStatus = item.lastStockStatus as StockStatus;
  const healthStatus = item.healthStatus as HealthStatus;
  // Trigger row-flash whenever lastCheckedAt advances. Avoids first-mount flash.
  // Toggle flashing on for the keyframe duration, then back off — the className
  // restart triggers a fresh animation. We use a state flag (no `key` on the
  // wrapper) so the dropdown-menu and dialogs aren't unmounted on every poll.
  useEffect(() => {
    const prev = lastCheckedRef.current;
    if (prev != null && item.lastCheckedAt != null && item.lastCheckedAt !== prev) {
      setFlashing(false);
      // Re-trigger the animation on the next frame so the className transition fires.
      const id = window.requestAnimationFrame(() => setFlashing(true));
      const off = window.setTimeout(() => setFlashing(false), 950);
      lastCheckedRef.current = item.lastCheckedAt;
      return () => {
        window.cancelAnimationFrame(id);
        window.clearTimeout(off);
      };
    }
    lastCheckedRef.current = item.lastCheckedAt;
  }, [item.lastCheckedAt]);

  async function handleCheckNow() {
    setBusy(true);
    try {
      const result = await checkNow(item.id);
      const stock = result.item.lastStockStatus;
      const health = result.item.healthStatus;
      if (health === "ERROR") {
        toast.error(`Check failed: ${result.item.lastHealthMessage ?? "error"}`);
      } else if (stock === "IN_STOCK") {
        toast.success("Checked: in stock");
      } else if (stock === "OUT_OF_STOCK") {
        toast.success("Checked: out of stock");
      } else {
        toast.success(`Checked: ${result.outcome}`);
      }
      onChanged();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Check failed";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleTogglePause() {
    setBusy(true);
    try {
      await patchItem(item.id, { enabled: isPaused });
      toast.success(isPaused ? "Resumed" : "Paused");
      onChanged();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  // Line-2 secondary text
  const consecutiveErrorsLine =
    item.consecutiveErrors >= 3
      ? `${item.consecutiveErrors} consecutive errors`
      : null;

  const priceLabel = formatPrice(item.currentPriceCents);
  // Show "at/below target" chip only when a target is set and current is at or under it.
  const atTarget =
    item.currentPriceCents != null &&
    item.targetPriceCents != null &&
    item.currentPriceCents <= item.targetPriceCents;
  const dropChip = atTarget ? (
    <span
      className="font-mono text-[10px] md:text-[11px] tabular-nums tracking-tight"
      style={{ color: "var(--color-status-pricedrop)" }}
      aria-label={`Current price at or below target of ${formatPrice(item.targetPriceCents!)}`}
      title={`Target ${formatPrice(item.targetPriceCents!)} — hit`}
    >
      ✓ at target
    </span>
  ) : null;
  const intervalLabel = formatInterval(item.checkIntervalMin);
  const relativeLabel = formatRelativeTime(item.lastCheckedAt);
  const identifierLabel =
    item.retailer === "microcenter"
      ? `MC ${item.mcProductId ?? "?"}`
      : `SKU ${item.sku}`;

  // SPEC §23 — surface non-default priceBlocks extras as inline chips on
  // line 2. Skip the common case (condition=new, seller=BBY direct, no sale).
  const conditionChip =
    item.condition && item.condition !== "new" ? item.condition : null;
  const marketplaceChip =
    item.sellerId && item.sellerId !== "BBY_OB" && item.sellerId !== "BBY"
      ? item.seller ?? "marketplace"
      : null;
  const saleEndsChip = (() => {
    if (item.saleEndsAt == null) return null;
    const diffMs = item.saleEndsAt - Date.now();
    if (diffMs <= 0) return null;
    const mins = Math.round(diffMs / 60_000);
    if (mins < 60) return `sale ends ${mins}m`;
    const hrs = Math.round(mins / 60);
    if (hrs < 48) return `sale ends ${hrs}h`;
    return `sale ends ${Math.round(hrs / 24)}d`;
  })();

  return (
    <>
      <div
        ref={sortable.setNodeRef}
        style={dragStyle}
        tabIndex={0}
        role="button"
        aria-label={`Open details for ${item.name ?? `SKU ${item.sku}`}`}
        onClick={() => setEditOpen(true)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setEditOpen(true);
          }
        }}
        className={`group relative flex items-center gap-3 px-1 py-2.5 min-h-12 cursor-pointer transition-colors duration-150 hover:bg-foreground/[0.03] active:bg-foreground/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
          flashing ? "row-flash" : ""
        } ${isPaused ? "opacity-60" : ""}`}
      >
        {/* Drag handle — hover-reveal on desktop, hidden when sort is disabled. */}
        {draggable ? (
          <button
            type="button"
            aria-label="Drag to reorder"
            onClick={(e) => e.stopPropagation()}
            {...sortable.attributes}
            {...sortable.listeners}
            className="hidden md:flex size-3 items-center justify-center text-muted-foreground/40 hover:text-foreground cursor-grab active:cursor-grabbing md:opacity-0 md:group-hover:opacity-100 transition-opacity"
          >
            <GripVerticalIcon className="size-3" aria-hidden="true" />
          </button>
        ) : (
          <div className="hidden md:block w-3" aria-hidden="true" />
        )}
        {/* dot — baseline-aligned with line-1 text via flex items-center on parent */}
        <div className="pl-2 pr-1 self-center">
          <StatusDot
            stockStatus={stockStatus}
            healthStatus={healthStatus}
          />
        </div>

        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt={item.name ?? (item.retailer === "microcenter" ? `MC ${item.mcProductId}` : `SKU ${item.sku}`)}
            width={40}
            height={40}
            unoptimized={item.retailer === "microcenter"}
            className="size-10 shrink-0 rounded-md border border-border bg-white object-contain p-1"
          />
        ) : null}

        {/* main content — two lines */}
        <div className="min-w-0 flex-1">
          {/* line 1 — spreadsheet-style columns on desktop. Fixed widths so price
              right edges and status labels align vertically across every row. */}
          <div className="flex items-baseline gap-3">
            <div className="min-w-0 flex-1">
              <a
                href={item.productUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-block max-w-full truncate text-sm font-medium text-foreground underline-offset-2 hover:underline"
                title={item.name ?? `SKU ${item.sku}`}
              >
                {item.name ?? `SKU ${item.sku}`}
              </a>
            </div>
            {/* Best-group-price column — narrow, right-aligned. */}
            <span className="hidden md:flex items-center justify-end gap-2 w-28 text-right whitespace-nowrap overflow-hidden">
              {dropChip}
              <DealsBadge summary={item.dealsSummary} />
            </span>
            {/* Price column — right-aligned fixed width. */}
            <span className="hidden md:block w-24 text-right text-sm font-semibold tabular-nums text-foreground whitespace-nowrap">
              {priceLabel}
            </span>
            {/* Status column — right-aligned fixed width, nowrap so labels never wrap. */}
            <span
              className="hidden md:block w-24 text-right font-mono text-xs uppercase tracking-wider whitespace-nowrap"
              style={{ color: badgeColorVar(item) }}
            >
              {badgeLabel(item)}
            </span>
          </div>

          {/* line 2 — desktop mirrors line-1 column widths so the group count
              column-aligns under the best-group-price chip. Mobile keeps a
              flat flex-wrap row with price + status pulled forward. */}
          <div className="mt-0.5 flex items-baseline gap-3 font-mono text-xs text-muted-foreground">
            <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {/* Mobile-only: price + status appear first on line 2. */}
              <span className="md:hidden text-xs font-semibold tabular-nums text-foreground">
                {priceLabel}
              </span>
              <span className="md:hidden">
                <DealsBadge summary={item.dealsSummary} />
              </span>
              {dropChip ? <span className="md:hidden">{dropChip}</span> : null}
              <span
                className="md:hidden font-mono text-[10px] uppercase tracking-wider"
                style={{ color: badgeColorVar(item) }}
              >
                {badgeLabel(item)}
              </span>
              <span aria-hidden="true" className="md:hidden">·</span>

              <span className="tabular-nums">{identifierLabel}</span>
              {item.upc ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">UPC {item.upc}</span>
                </>
              ) : null}
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{intervalLabel}</span>
              <span aria-hidden="true">·</span>
              {consecutiveErrorsLine ? (
                <span
                  className="tabular-nums"
                  style={{ color: "var(--color-status-error)" }}
                >
                  {consecutiveErrorsLine}
                </span>
              ) : (
                <span className="tabular-nums">checked {relativeLabel}</span>
              )}
              {conditionChip ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span
                    className="font-mono text-[10px] uppercase tracking-wider"
                    style={{ color: "var(--color-status-degraded)" }}
                  >
                    {conditionChip}
                  </span>
                </>
              ) : null}
              {marketplaceChip ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span
                    className="font-mono text-[10px] uppercase tracking-wider"
                    title={`Sold by ${marketplaceChip}, not Best Buy directly`}
                  >
                    {marketplaceChip}
                  </span>
                </>
              ) : null}
              {saleEndsChip ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span
                    className="tabular-nums"
                    style={{ color: "var(--color-status-pricedrop)" }}
                  >
                    {saleEndsChip}
                  </span>
                </>
              ) : null}
              {isPaused ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>paused</span>
                </>
              ) : null}
            </div>
            {/* Desktop only: column-aligned group-count under the chip column.
                Empty cells under the BB-price and status columns keep alignment. */}
            <span className="hidden md:block w-28 text-right tabular-nums whitespace-nowrap">
              {item.dealsSummary.groupCount > 0
                ? `${item.dealsSummary.groupCount} group${item.dealsSummary.groupCount === 1 ? "" : "s"}`
                : ""}
            </span>
            <span className="hidden md:block w-24" aria-hidden="true" />
            <span className="hidden md:block w-24" aria-hidden="true" />
          </div>
        </div>

        {/* dropdown trigger — always visible on mobile, hover-reveal on desktop */}
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-10 md:size-9 font-mono text-lg text-muted-foreground hover:text-foreground md:opacity-0 md:scale-75 md:group-hover:opacity-100 md:group-hover:scale-100 md:focus-visible:opacity-100 md:focus-visible:scale-100 md:aria-expanded:opacity-100 md:aria-expanded:scale-100 transition-all duration-200 ease-out"
                disabled={busy}
                aria-label="Item actions"
              />
            }
          >
            ⋯
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={4}
            className="w-52 md:w-44"
          >
            <DropdownMenuItem onClick={handleCheckNow}>
              check now
              {isDesktop ? (
                <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              edit
              {isDesktop ? (
                <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleTogglePause}>
              {isPaused ? "resume" : "pause"}
              {isDesktop ? (
                <DropdownMenuShortcut>⌘P</DropdownMenuShortcut>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setHistoryOpen(true)}>
              view history
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                window.open(item.productUrl, "_blank", "noopener,noreferrer");
              }}
            >
              open on best buy
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
            >
              delete
            </DropdownMenuItem>
          </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <EditItemDialog
        item={item}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={onChanged}
      />
      <ItemHistoryDialog
        item={item}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
      <ConfirmDeleteDialog
        item={item}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={onChanged}
      />
    </>
  );
}
