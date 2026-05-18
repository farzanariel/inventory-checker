"use client";

/**
 * Sortable column header for the watchlist (SPEC §24).
 *
 * Three states per column: none → asc → desc → none (cycle).
 * Column widths must exactly mirror ItemRow's line-1 columns or alignment
 * breaks. Mobile gets no header — too narrow.
 */
import { ChevronDownIcon, ChevronUpIcon, ChevronsUpDownIcon } from "lucide-react";

import type { ItemWithDeals } from "@/lib/api";

export type SortColumn = "name" | "groupPrice" | "price" | "status";
export type SortDir = "asc" | "desc";
export type SortState = { column: SortColumn; dir: SortDir } | null;

type Props = {
  sort: SortState;
  onChange: (next: SortState) => void;
};

function nextState(
  current: SortState,
  column: SortColumn,
): SortState {
  if (current?.column !== column) return { column, dir: "asc" };
  if (current.dir === "asc") return { column, dir: "desc" };
  return null;
}

function Header({
  label,
  column,
  align,
  className,
  sort,
  onClick,
}: {
  label: string;
  column: SortColumn;
  align: "left" | "right";
  className: string;
  sort: SortState;
  onClick: () => void;
}) {
  const active = sort?.column === column;
  const Icon = !active
    ? ChevronsUpDownIcon
    : sort?.dir === "asc"
      ? ChevronUpIcon
      : ChevronDownIcon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${className} inline-flex items-center ${
        align === "right" ? "justify-end" : "justify-start"
      } gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors`}
      aria-sort={
        active ? (sort?.dir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      {align === "right" ? (
        <>
          <Icon
            className={`size-3 ${active ? "text-foreground" : "opacity-50"}`}
            aria-hidden="true"
          />
          {label}
        </>
      ) : (
        <>
          {label}
          <Icon
            className={`size-3 ${active ? "text-foreground" : "opacity-50"}`}
            aria-hidden="true"
          />
        </>
      )}
    </button>
  );
}

export function ItemListHeader({ sort, onChange }: Props) {
  const cycle = (column: SortColumn) => onChange(nextState(sort, column));
  return (
    <div className="hidden md:flex items-center gap-3 px-1 py-1.5 border-b border-border/60 sticky top-0 z-10 bg-background/95 backdrop-blur">
      {/* spacer for drag-handle / status-dot / image */}
      <div className="pl-2 pr-1 w-3" aria-hidden="true" />
      <div className="w-10" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <Header
          label="Item"
          column="name"
          align="left"
          className="w-full"
          sort={sort}
          onClick={() => cycle("name")}
        />
      </div>
      <Header
        label="Group"
        column="groupPrice"
        align="right"
        className="w-28"
        sort={sort}
        onClick={() => cycle("groupPrice")}
      />
      <Header
        label="Price"
        column="price"
        align="right"
        className="w-24"
        sort={sort}
        onClick={() => cycle("price")}
      />
      <Header
        label="Status"
        column="status"
        align="right"
        className="w-24"
        sort={sort}
        onClick={() => cycle("status")}
      />
      {/* dropdown trigger column placeholder so headers align with row content */}
      <div className="size-7" aria-hidden="true" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sort comparator
// ---------------------------------------------------------------------------

const STATUS_RANK: Record<string, number> = {
  IN_STOCK: 0,
  OUT_OF_STOCK: 1,
  UNKNOWN: 2,
};

function statusScore(item: ItemWithDeals): number {
  if (item.healthStatus === "ERROR") return 3;
  return STATUS_RANK[item.lastStockStatus] ?? 2;
}

/**
 * Compare two items by the active sort column. Null/missing values sort
 * LAST regardless of direction so meaningful data stays visible at the top.
 */
export function compareItems(
  a: ItemWithDeals,
  b: ItemWithDeals,
  sort: { column: SortColumn; dir: SortDir },
): number {
  const sign = sort.dir === "asc" ? 1 : -1;
  switch (sort.column) {
    case "name": {
      const an = a.name ?? "";
      const bn = b.name ?? "";
      return sign * an.localeCompare(bn);
    }
    case "groupPrice": {
      const ap = a.dealsSummary.bestGroupPriceCents;
      const bp = b.dealsSummary.bestGroupPriceCents;
      if (ap == null && bp == null) return 0;
      if (ap == null) return 1; // null always last
      if (bp == null) return -1;
      return sign * (ap - bp);
    }
    case "price": {
      const ap = a.currentPriceCents;
      const bp = b.currentPriceCents;
      if (ap == null && bp == null) return 0;
      if (ap == null) return 1;
      if (bp == null) return -1;
      return sign * (ap - bp);
    }
    case "status": {
      return sign * (statusScore(a) - statusScore(b));
    }
  }
}
