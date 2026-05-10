"use client";

/**
 * ItemHistoryDialog — recent stock_events for one item.
 *
 * Renders as a centered <Dialog> on md+ and a bottom <Drawer> on mobile.
 * Loads on open. The inner panel is keyed by item.id so React mounts a fresh
 * component (with fresh state and a fresh fetch) each time.
 *
 * Layout: tight 5-column grid on desktop (Time / Status / Button state /
 * Price / Message). Mobile collapses to a stacked card per event.
 */

import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsDesktop } from "@/hooks/use-media-query";
import { fetchEvents } from "@/lib/api";
import type { Item, StockEvent } from "@/lib/db/schema";
import {
  formatAbsoluteTime,
  formatPrice,
  formatRelativeTime,
} from "@/lib/format";

type Props = {
  item: Item | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function statusColor(status: string): string {
  switch (status) {
    case "IN_STOCK":
      return "var(--color-status-in)";
    case "OUT_OF_STOCK":
      return "var(--color-status-out)";
    case "ERROR":
      return "var(--color-status-error)";
    case "NOTIFIED":
      return "var(--color-status-degraded)";
    default:
      return "var(--color-status-out)";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "IN_STOCK":
      return "IN STOCK";
    case "OUT_OF_STOCK":
      return "OOS";
    case "ERROR":
      return "ERROR";
    case "NOTIFIED":
      return "NOTIFIED";
    default:
      return status;
  }
}

function HistoryPanel({ item }: { item: Item }) {
  const [events, setEvents] = useState<StockEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    fetchEvents(item.id, 50)
      .then((rows) => {
        if (cancelled) return;
        setEvents(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load events");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [item.id]);

  if (loading) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Loading events…
      </p>
    );
  }
  if (error) {
    return (
      <p
        className="py-8 text-center text-sm font-mono"
        style={{ color: "var(--color-status-error)" }}
      >
        {error}
      </p>
    );
  }
  if (events && events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <span
          className="size-1.5 rounded-full bg-muted-foreground/40"
          aria-hidden="true"
        />
        <p className="text-sm text-muted-foreground">No events recorded yet.</p>
      </div>
    );
  }
  if (!events) return null;

  return (
    <div className="divide-y divide-border">
      {/* Desktop column header */}
      <div className="hidden md:grid grid-cols-[10rem_5.5rem_8rem_5.5rem_1fr] gap-3 px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Time</span>
        <span>Status</span>
        <span>Button state</span>
        <span className="text-right">Price</span>
        <span>Message</span>
      </div>
      {events.map((ev) => (
        <div key={ev.id} className="px-2 py-2 md:py-1.5">
          {/* Desktop: 5-column grid */}
          <div className="hidden md:grid grid-cols-[10rem_5.5rem_8rem_5.5rem_1fr] gap-3 text-sm">
            <span
              className="font-mono text-xs tabular-nums text-muted-foreground"
              title={formatAbsoluteTime(ev.ts)}
            >
              {formatRelativeTime(ev.ts)}
            </span>
            <span
              className="font-mono text-[11px] uppercase tracking-wider"
              style={{ color: statusColor(ev.status) }}
            >
              {statusLabel(ev.status)}
            </span>
            <span className="font-mono text-xs text-muted-foreground truncate">
              {ev.buttonState ?? "—"}
            </span>
            <span className="font-mono text-xs text-right tabular-nums">
              {formatPrice(ev.priceCents)}
            </span>
            <span
              className={`text-xs truncate ${ev.message ? "italic text-muted-foreground" : "text-muted-foreground/40"}`}
            >
              {ev.message ?? ""}
            </span>
          </div>

          {/* Mobile: stacked */}
          <div className="md:hidden flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span
                className="font-mono text-[11px] uppercase tracking-wider"
                style={{ color: statusColor(ev.status) }}
              >
                {statusLabel(ev.status)}
              </span>
              <span
                className="font-mono text-xs tabular-nums text-muted-foreground"
                title={formatAbsoluteTime(ev.ts)}
              >
                {formatRelativeTime(ev.ts)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 font-mono text-xs text-muted-foreground">
              <span className="truncate">{ev.buttonState ?? "—"}</span>
              <span className="tabular-nums">
                {formatPrice(ev.priceCents)}
              </span>
            </div>
            {ev.message ? (
              <p className="text-xs italic text-muted-foreground">
                {ev.message}
              </p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ItemHistoryDialog({ item, open, onOpenChange }: Props) {
  const isDesktop = useIsDesktop();

  const titleEl = "History";
  const descriptionEl = item ? (
    <>
      <span className="font-mono tabular-nums">SKU {item.sku}</span>
      {" · "}
      <span>{item.name ?? "—"}</span>
    </>
  ) : null;

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{titleEl}</DialogTitle>
            <DialogDescription>{descriptionEl}</DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto">
            {item && open ? <HistoryPanel key={item.id} item={item} /> : null}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{titleEl}</DrawerTitle>
          <DrawerDescription>{descriptionEl}</DrawerDescription>
        </DrawerHeader>
        <div className="max-h-[70vh] overflow-y-auto">
          {item && open ? <HistoryPanel key={item.id} item={item} /> : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
