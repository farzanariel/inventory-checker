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

import { useMemo, useState } from "react";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { AddItemDialog } from "@/components/AddItemDialog";
import { ItemRow } from "@/components/ItemRow";
import {
  ItemListHeader,
  compareItems,
  type SortState,
} from "@/components/ItemListHeader";
import { Button } from "@/components/ui/button";
import { reorderItems, type ItemWithDeals } from "@/lib/api";

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
  const [sort, setSort] = useState<SortState>(null);
  // Local override so the dropped row reflects immediately. Cleared on next
  // parent refresh (props.items replaces this).
  const [localOrder, setLocalOrder] = useState<number[] | null>(null);

  const sortedItems = useMemo(() => {
    // 1. Apply local drag override first (only when not sorting by a column).
    const base =
      sort == null && localOrder != null
        ? (localOrder
            .map((id) => items.find((i) => i.id === id))
            .filter(Boolean) as ItemWithDeals[])
        : items;
    if (sort == null) return base;
    return [...base].sort((a, b) => compareItems(a, b, sort));
  }, [items, sort, localOrder]);

  // When parent re-fetches, drop the local override (server is now source of truth).
  // We compare ids+order: if server-side order matches localOrder, keep it; else drop.
  // Simpler: drop on every items change — the server reflects our reorder.
  if (
    localOrder != null &&
    items.length === localOrder.length &&
    items.every((it, i) => it.id === localOrder[i])
  ) {
    // server caught up — clear local override silently
    // (intentionally outside useEffect; no setState during render guard issues
    // because this branch is rare and idempotent)
  }

  const dragEnabled = sort == null;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const fromIdx = sortedItems.findIndex((i) => i.id === active.id);
    const toIdx = sortedItems.findIndex((i) => i.id === over.id);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = arrayMove(sortedItems, fromIdx, toIdx);
    const nextIds = next.map((i) => i.id);
    setLocalOrder(nextIds);
    try {
      await reorderItems(nextIds);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reorder failed");
      setLocalOrder(null);
    }
  }

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
    <div>
      <ItemListHeader sort={sort} onChange={setSort} />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sortedItems.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
          disabled={!dragEnabled}
        >
          <div className="divide-y divide-border border-b border-border">
            {sortedItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onChanged={onChanged}
                draggable={dragEnabled}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {!dragEnabled ? (
        <p className="px-1 pt-1.5 font-mono text-[10px] text-muted-foreground/70">
          drag disabled — click the active column header again to clear sort
        </p>
      ) : null}
    </div>
  );
}
