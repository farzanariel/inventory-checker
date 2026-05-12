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
import {
  PRICE_ALERT_DEFAULTS,
  PriceAlertSection,
  type PriceAlertValues,
} from "@/components/PriceAlertSection";
import {
  STOCK_ALERT_DEFAULTS,
  StockAlertSection,
  type StockAlertValues,
} from "@/components/StockAlertSection";
import { useIsDesktop } from "@/hooks/use-media-query";
import { createItem, lookupProduct, type ProductLookup } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { looksResolvableBestBuyInput } from "@/lib/parse-input";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: () => void;
};

export function AddItemDialog({ open, onOpenChange, onAdded }: Props) {
  const isDesktop = useIsDesktop();
  const [input, setInput] = useState("");
  const [stockAlert, setStockAlert] =
    useState<StockAlertValues>(STOCK_ALERT_DEFAULTS);
  const [note, setNote] = useState("");
  const [priceAlert, setPriceAlert] =
    useState<PriceAlertValues>(PRICE_ALERT_DEFAULTS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<ProductLookup | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  function reset() {
    setInput("");
    setStockAlert(STOCK_ALERT_DEFAULTS);
    setNote("");
    setPriceAlert(PRICE_ALERT_DEFAULTS);
    setError(null);
    setLookup(null);
    setLookupError(null);
    setLookupLoading(false);
    setSubmitting(false);
  }

  useEffect(() => {
    if (!open) return;

    const trimmed = input.trim();
    if (!looksResolvableBestBuyInput(trimmed)) {
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
    if (!stockAlert.enabled && !priceAlert.enabled) {
      setError("Enable stock alerts, price alerts, or both.");
      setSubmitting(false);
      return;
    }
    setSubmitting(true);
    try {
      const targetDollarsNum = Number.parseFloat(priceAlert.targetDollars);
      const targetCents =
        priceAlert.targetDollars.trim() !== "" && Number.isFinite(targetDollarsNum)
          ? Math.round(targetDollarsNum * 100)
          : undefined;
      const created = await createItem({
        input: input.trim(),
        check_interval_min: Number.parseInt(stockAlert.checkIntervalMin, 10) || 1,
        restock_notify_interval_min:
          Number.parseInt(stockAlert.restockIntervalMin, 10) || 10,
        note: note.trim() || undefined,
        stock_alert_enabled: stockAlert.enabled,
        stock_notify_mode: stockAlert.notifyMode,
        price_alert_enabled: priceAlert.enabled,
        ...(targetCents !== undefined && { target_price_cents: targetCents }),
        price_notify_interval_min:
          Number.parseInt(priceAlert.notifyIntervalMin, 10) || 60,
        price_notify_mode: priceAlert.notifyMode,
        price_alert_while_oos: priceAlert.whileOos,
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
    <div className="flex min-w-0 flex-col gap-4">
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
                    {lookup.current_price_cents !== null
                      ? formatPrice(lookup.current_price_cents)
                      : "—"}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">
                    {lookup.button_state
                      ? lookup.button_state.replaceAll("_", " ")
                      : "stock pending"}
                  </span>
                </div>
                {lookup.stock_source === "metadata-only" ? (
                  <p className="font-mono text-[10px] leading-snug text-muted-foreground break-words">
                    Best Buy&apos;s pricing API doesn&apos;t index this SKU yet.
                    Item will be added now; price + stock fill in on the next worker check.
                  </p>
                ) : null}
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

      <StockAlertSection
        idPrefix="add"
        values={stockAlert}
        onChange={setStockAlert}
        disabled={submitting}
      />

      <PriceAlertSection
        idPrefix="add"
        values={priceAlert}
        onChange={setPriceAlert}
        currentPriceCents={lookup?.current_price_cents ?? null}
        disabled={submitting}
      />

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
