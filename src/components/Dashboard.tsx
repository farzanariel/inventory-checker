"use client";

/**
 * Dashboard — orchestrates the page.
 *
 * Owns:
 *  - the items list (single source of truth)
 *  - the 5s poll loop against /api/items
 *  - the "last synced" timestamp shown in the header
 *  - the mobile floating-action-button that opens AddItemDialog
 *
 * HeaderBar polls /api/health independently on its own 10s schedule.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { PlusIcon } from "lucide-react";

import { AddItemDialog } from "@/components/AddItemDialog";
import { HeaderBar } from "@/components/HeaderBar";
import { ItemList } from "@/components/ItemList";
import { fetchItems, type ItemWithDeals } from "@/lib/api";

const POLL_INTERVAL_MS = 5_000;

export function Dashboard() {
  const [items, setItems] = useState<ItemWithDeals[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [fabAddOpen, setFabAddOpen] = useState(false);

  // Use a ref so the interval callback always sees the latest values without
  // being torn down on every state change.
  const inFlightRef = useRef(false);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const next = await fetchItems(signal);
      setItems(next);
      setError(null);
      setLastSyncAt(Date.now());
    } catch (err) {
      // Ignore aborts
      if (err instanceof DOMException && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Failed to load";
      setError(message);
    } finally {
      inFlightRef.current = false;
      setInitialLoading(false);
    }
  }, []);

  // Mount: first load + 5s poll. The async refresh writes state via Promise
  // continuation, which is the standard pattern for fetch-on-mount; the
  // set-state-in-effect rule fires a false positive here.
  useEffect(() => {
    const ac = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh(ac.signal);
    const id = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => {
      ac.abort();
      window.clearInterval(id);
    };
  }, [refresh]);

  const onChanged = useCallback(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="min-h-screen bg-background">
      <HeaderBar
        watchingCount={items.length}
        lastSyncAt={lastSyncAt}
        onAdded={onChanged}
      />
      <main className="mx-auto max-w-[1200px] px-4 pt-4 pb-32 md:px-6 md:pt-8 md:pb-24">
        <ItemList
          items={items}
          loading={initialLoading}
          error={error}
          onChanged={onChanged}
        />
      </main>

      {/* Mobile FAB — Add item. Hidden on md+ where header has its own button. */}
      <button
        type="button"
        onClick={() => setFabAddOpen(true)}
        aria-label="Add item"
        className="md:hidden fixed right-4 z-40 inline-flex size-14 items-center justify-center rounded-full text-primary-foreground shadow-lg ring-1 ring-foreground/10 transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
        style={{
          backgroundColor: "var(--color-status-in)",
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)",
        }}
      >
        <PlusIcon className="size-6" aria-hidden="true" />
      </button>

      <AddItemDialog
        open={fabAddOpen}
        onOpenChange={setFabAddOpen}
        onAdded={onChanged}
      />
    </div>
  );
}
