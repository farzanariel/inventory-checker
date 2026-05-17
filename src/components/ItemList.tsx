"use client";

/**
 * ItemList — renders rows. Items + refresh callback come from the parent
 * Dashboard component, which owns the 5s poll loop.
 *
 * Shows three states:
 *  - first load (initialLoading=true && no items): skeleton rows
 *  - loaded with zero items: polished empty state with inline illustration
 *  - any other state: the row list (subsequent polls do NOT show skeletons)
 */

import { useState } from "react";
import { PlusIcon } from "lucide-react";

import { AddItemDialog } from "@/components/AddItemDialog";
import { ItemRow } from "@/components/ItemRow";
import { Button } from "@/components/ui/button";
import type { ItemWithDeals } from "@/lib/api";

type Props = {
  items: ItemWithDeals[];
  loading: boolean;
  error: string | null;
  onChanged: () => void;
};

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-1 py-2.5 min-h-12">
      <div className="pl-2 pr-1">
        <span className="skeleton block size-2 rounded-full" />
      </div>
      <div className="min-w-0 flex-1 flex flex-col gap-1.5">
        <div className="flex items-center gap-3">
          <span className="skeleton h-3.5 flex-1 max-w-[14rem]" />
          <span className="skeleton h-3.5 w-16 hidden sm:block" />
          <span className="skeleton h-3 w-16" />
        </div>
        <span className="skeleton h-2.5 w-44" />
      </div>
      <span className="skeleton h-7 w-7 rounded-md" />
    </div>
  );
}

function EmptyIllustration() {
  // Stylised package with a "+" inside — single inline SVG, no asset request,
  // colour driven by currentColor (inherits text-muted-foreground).
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-muted-foreground/60"
    >
      {/* dotted ring backdrop */}
      <circle
        cx="32"
        cy="32"
        r="28"
        strokeWidth="1"
        strokeDasharray="2 4"
        className="opacity-40"
      />
      {/* package body */}
      <path
        d="M16 24 L32 16 L48 24 L48 44 L32 52 L16 44 Z"
        strokeWidth="1.5"
      />
      <path d="M16 24 L32 32 L48 24" strokeWidth="1.5" />
      <path d="M32 32 L32 52" strokeWidth="1.5" />
      {/* subtle plus glyph at the package's heart */}
      <path d="M32 36 L32 44" strokeWidth="1.5" />
      <path d="M28 40 L36 40" strokeWidth="1.5" />
    </svg>
  );
}

export function ItemList({ items, loading, error, onChanged }: Props) {
  const [addOpen, setAddOpen] = useState(false);

  if (loading && items.length === 0) {
    return (
      <div
        className="divide-y divide-border border-y border-border"
        role="status"
        aria-live="polite"
        aria-label="Loading items"
      >
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <div
        className="py-16 text-center text-sm font-mono"
        style={{ color: "var(--color-status-error)" }}
        role="alert"
      >
        {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center md:py-24">
          <EmptyIllustration />
          <p className="text-sm font-medium text-foreground">
            No items watched yet
          </p>
          <p className="max-w-[20rem] text-xs text-muted-foreground">
            Paste a Best Buy URL or SKU to start.
          </p>
          <Button
            variant="default"
            size="sm"
            className="mt-3 w-full max-w-[14rem] active:scale-[0.97]"
            onClick={() => setAddOpen(true)}
          >
            <PlusIcon className="size-3.5" aria-hidden="true" />
            Add item
          </Button>
        </div>
        <AddItemDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          onAdded={onChanged}
        />
      </>
    );
  }

  return (
    <div className="divide-y divide-border border-y border-border">
      {items.map((item) => (
        <ItemRow key={item.id} item={item} onChanged={onChanged} />
      ))}
    </div>
  );
}
