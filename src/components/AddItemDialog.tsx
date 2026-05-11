"use client";

/**
 * AddItemDialog — paste a Best Buy URL or raw SKU, configure intervals + note.
 * Submits to POST /api/items.
 *
 * Renders as a centered <Dialog> on md+ and as a bottom <Drawer> on mobile so
 * the form sits at thumb-reach. Form internals are identical.
 *
 * Controlled: parent owns open state.
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIsDesktop } from "@/hooks/use-media-query";
import { createItem, lookupProduct, type ProductLookup } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { parseUrlOrSku } from "@/lib/parse-input";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: () => void;
};

export function AddItemDialog({ open, onOpenChange, onAdded }: Props) {
  const isDesktop = useIsDesktop();
  const [input, setInput] = useState("");
  const [checkInterval, setCheckInterval] = useState("1");
  const [restockInterval, setRestockInterval] = useState("10");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<ProductLookup | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  function reset() {
    setInput("");
    setCheckInterval("1");
    setRestockInterval("10");
    setNote("");
    setError(null);
    setLookup(null);
    setLookupError(null);
    setLookupLoading(false);
    setSubmitting(false);
  }

  useEffect(() => {
    if (!open) return;

    const trimmed = input.trim();
    const parsed = parseUrlOrSku(trimmed);
    if (!parsed.ok) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setLookupLoading(true);
      setLookupError(null);
      try {
        const product = await lookupProduct(trimmed, controller.signal);
        setLookup(product);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const message =
          err instanceof Error ? err.message : "Product details unavailable";
        setLookup(null);
        setLookupError(message);
      } finally {
        if (!controller.signal.aborted) {
          setLookupLoading(false);
        }
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [input, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const created = await createItem({
        input: input.trim(),
        check_interval_min: Number.parseInt(checkInterval, 10) || 1,
        restock_notify_interval_min:
          Number.parseInt(restockInterval, 10) || 10,
        note: note.trim() || undefined,
      });
      toast.success(`Added: ${created.name ?? `SKU ${created.sku}`}`);
      onAdded?.();
      onOpenChange(false);
      // delay reset so closing animation runs against the still-filled form
      setTimeout(reset, 200);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add item";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  // Body — same form on every viewport. Wrapper differs.
  const formBody = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="add-input">URL or SKU</Label>
        <Input
          id="add-input"
          autoFocus
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setLookup(null);
            setLookupError(null);
            setLookupLoading(false);
          }}
          placeholder="Paste a Best Buy URL or SKU"
          inputMode="text"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="font-mono text-base sm:text-sm"
          disabled={submitting}
        />
      </div>

      {lookup || lookupLoading || lookupError ? (
        <div
          className="overflow-hidden rounded-lg border border-border bg-card px-3 py-2"
          aria-live="polite"
        >
          {lookup ? (
            <div className="flex min-w-0 gap-3">
              <Image
                src={lookup.image_url}
                alt={lookup.name}
                width={56}
                height={56}
                className="size-14 shrink-0 rounded-md border border-border bg-white object-contain p-1"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex min-w-0 items-start gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {lookup.name}
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    SKU {lookup.sku}
                  </span>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-xs text-muted-foreground">
                  {lookup.brand ? <span className="truncate">{lookup.brand}</span> : null}
                  {lookup.brand ? <span aria-hidden="true">·</span> : null}
                  <span className="tabular-nums">
                    {formatPrice(lookup.current_price_cents)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">{lookup.button_state.replaceAll("_", " ")}</span>
                </div>
              </div>
            </div>
          ) : null}
          {lookupLoading ? (
            <p className="font-mono text-xs text-muted-foreground">
              Fetching product details...
            </p>
          ) : null}
          {lookupError ? (
            <p
              className="font-mono text-xs"
              style={{ color: "var(--color-status-error)" }}
              role="status"
            >
              {lookupError}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="check-interval">Check every (min)</Label>
          <Input
            id="check-interval"
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            min={1}
            max={60}
            step={1}
            value={checkInterval}
            onChange={(e) => setCheckInterval(e.target.value)}
            className="font-mono tabular-nums text-base sm:text-sm"
            disabled={submitting}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="restock-interval">Re-notify every (min)</Label>
          <Input
            id="restock-interval"
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            min={1}
            max={1440}
            step={1}
            value={restockInterval}
            onChange={(e) => setRestockInterval(e.target.value)}
            className="font-mono tabular-nums text-base sm:text-sm"
            disabled={submitting}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground -mt-1">
        Recommend 1–2 min for check, 10+ min for re-notify.
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="add-note">Note (optional)</Label>
        <textarea
          id="add-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional — shown in alerts"
          rows={2}
          className="w-full min-h-[2.5rem] resize-y rounded-lg border border-input bg-input/30 px-2.5 py-1.5 text-base sm:text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          disabled={submitting}
        />
      </div>

      {error ? (
        <p
          className="text-xs font-mono"
          style={{ color: "var(--color-status-error)" }}
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );

  // Desktop: centered dialog
  if (isDesktop) {
    return (
      <Dialog
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next);
          if (!next) setTimeout(reset, 200);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit} className="contents">
            <DialogHeader>
              <DialogTitle>Add item</DialogTitle>
              <DialogDescription>
                Paste a Best Buy product URL or raw SKU. We will start checking
                immediately.
              </DialogDescription>
            </DialogHeader>
            {formBody}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submitting || input.trim().length === 0}
              >
                {submitting ? "Adding…" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    );
  }

  // Mobile: bottom sheet
  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setTimeout(reset, 200);
      }}
    >
      <DrawerContent>
        <form onSubmit={handleSubmit} className="contents">
          <DrawerHeader>
            <DrawerTitle>Add item</DrawerTitle>
            <DrawerDescription>
              Paste a Best Buy product URL or raw SKU. We will start checking
              immediately.
            </DrawerDescription>
          </DrawerHeader>
          {formBody}
          <DrawerFooter>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-11 active:scale-[0.98]"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="lg"
              className="h-11 active:scale-[0.98]"
              disabled={submitting || input.trim().length === 0}
            >
              {submitting ? "Adding…" : "Add"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
