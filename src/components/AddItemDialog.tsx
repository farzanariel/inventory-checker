"use client";

/**
 * AddItemDialog — paste a Best Buy / MicroCenter URL or raw SKU, configure
 * alerts. Submits to POST /api/items.
 *
 * Renders as a centered <Dialog> on md+ and as a bottom <Drawer> on mobile so
 * the form sits at thumb-reach. Form internals are identical.
 *
 * Defaults (per UX requirement):
 *  - stock alerts default OFF
 *  - price alerts default ON
 *  - after lookup, if the item is currently out of stock we flip stock ON
 *    (price stays on; user can opt out)
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
import {
  McStorePicker,
  type McStoreOption,
} from "@/components/McStorePicker";
import { useIsDesktop } from "@/hooks/use-media-query";
import { createItem, lookupProduct, type ProductLookup } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { looksResolvableProductInput } from "@/lib/parse-input";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: () => void;
};

/**
 * Is the looked-up product currently out of stock? Used to auto-enable the
 * stock-alert toggle (since the user is almost certainly here to be pinged
 * when it restocks).
 *
 * BBY: `purchasable === false` is the canonical OOS signal.
 * MC : no in-stock store across the chain.
 */
function isLookupOutOfStock(lookup: ProductLookup): boolean {
  if (lookup.retailer === "microcenter") {
    return !lookup.stores.some((s) => s.in_stock);
  }
  return lookup.purchasable === false;
}

function stockLabel(lookup: ProductLookup): string {
  if (lookup.retailer === "microcenter") {
    return `${lookup.stores.filter((s) => s.in_stock).length}/${lookup.stores.length} stores in stock`;
  }
  if (lookup.purchasable === true) return "in stock";
  if (lookup.purchasable === false) return "out of stock";
  return "stock pending";
}

export function AddItemDialog({ open, onOpenChange, onAdded }: Props) {
  const isDesktop = useIsDesktop();
  const [input, setInput] = useState("");
  const [stockAlert, setStockAlert] =
    useState<StockAlertValues>(STOCK_ALERT_DEFAULTS);
  const [priceAlert, setPriceAlert] =
    useState<PriceAlertValues>(PRICE_ALERT_DEFAULTS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<ProductLookup | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  // MicroCenter only: which store_numbers are alert-enabled. Defaults to
  // every store returned by the lookup. Reset whenever a new MC lookup lands.
  const [mcEnabledStores, setMcEnabledStores] = useState<Set<string>>(new Set());

  function reset() {
    setInput("");
    setStockAlert(STOCK_ALERT_DEFAULTS);
    setPriceAlert(PRICE_ALERT_DEFAULTS);
    setError(null);
    setLookup(null);
    setLookupError(null);
    setLookupLoading(false);
    setSubmitting(false);
    setMcEnabledStores(new Set());
  }

  useEffect(() => {
    if (!open) return;

    const trimmed = input.trim();
    if (!looksResolvableProductInput(trimmed)) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setLookupLoading(true);
      setLookupError(null);
      try {
        const product = await lookupProduct(trimmed, controller.signal);
        setLookup(product);
        if (product.retailer === "microcenter") {
          setMcEnabledStores(new Set(product.stores.map((s) => s.store_number)));
        }
        // Smart defaults: flip stock alerts ON if currently OOS.
        if (isLookupOutOfStock(product)) {
          setStockAlert((prev) => ({ ...prev, enabled: true }));
        }
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
      const isMc = lookup?.retailer === "microcenter";
      if (isMc && mcEnabledStores.size === 0) {
        setError("Pick at least one MicroCenter store to alert on.");
        setSubmitting(false);
        return;
      }
      const created = await createItem({
        input: input.trim(),
        check_interval_min: Number.parseInt(stockAlert.checkIntervalMin, 10) || 1,
        restock_notify_interval_min:
          Number.parseInt(stockAlert.restockIntervalMin, 10) || 10,
        stock_alert_enabled: stockAlert.enabled,
        stock_notify_mode: stockAlert.notifyMode,
        price_alert_enabled: priceAlert.enabled,
        ...(targetCents !== undefined && { target_price_cents: targetCents }),
        price_notify_interval_min:
          Number.parseInt(priceAlert.notifyIntervalMin, 10) || 60,
        price_notify_mode: priceAlert.notifyMode,
        price_alert_while_oos: priceAlert.whileOos,
        ...(isMc && { enabled_store_numbers: [...mcEnabledStores] }),
      });
      const idLabel = created.retailer === "microcenter"
        ? (created.mcProductId ? `MC ${created.mcProductId}` : "MicroCenter item")
        : `SKU ${created.sku ?? "?"}`;
      toast.success(`Added: ${created.name ?? idLabel}`);
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

  const mcOptions: McStoreOption[] | null =
    lookup?.retailer === "microcenter"
      ? lookup.stores.map((s) => ({
          store_number: s.store_number,
          store_name: s.store_name,
          in_stock: s.in_stock,
          qoh: s.qoh,
        }))
      : null;

  // Body — same form on every viewport. Wrapper differs.
  const formBody = (
    <div className="flex min-w-0 flex-col gap-5">
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
          placeholder="Paste a Best Buy or MicroCenter URL (or a BB SKU)"
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
          className="overflow-hidden rounded-lg border border-[var(--surface-recessed-border)] bg-[var(--surface-recessed)] px-3 py-2.5"
          aria-live="polite"
        >
          {lookup ? (
            <div className="flex min-w-0 gap-3">
              {lookup.image_url ? (
                <Image
                  src={lookup.image_url}
                  alt={lookup.name}
                  width={56}
                  height={56}
                  // MC's image CDN is Cloudflare-gated against Next's
                  // server-side image proxy. Browsers can usually still load
                  // it directly (residential IP + standard headers), so skip
                  // optimization for MC and let the client fetch raw.
                  unoptimized={lookup.retailer === "microcenter"}
                  className="size-14 shrink-0 rounded-md border border-border bg-white object-contain p-1"
                />
              ) : (
                <div className="size-14 shrink-0 rounded-md border border-border bg-muted" />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex min-w-0 items-start gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {lookup.name}
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {lookup.retailer === "microcenter"
                      ? `MC ${lookup.mc_product_id}`
                      : `SKU ${lookup.sku}`}
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
                    {stockLabel(lookup)}
                  </span>
                </div>
                {lookup.retailer === "bestbuy" && lookup.stock_source === "metadata-only" ? (
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

      {mcOptions ? (
        <McStorePicker
          stores={mcOptions}
          selected={mcEnabledStores}
          onChange={setMcEnabledStores}
          disabled={submitting}
        />
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
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSubmit} className="contents">
            <DialogHeader>
              <DialogTitle>Add item</DialogTitle>
              <DialogDescription>
                Paste a Best Buy or MicroCenter product URL (or a Best Buy SKU).
                We start checking immediately.
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
              Paste a Best Buy or MicroCenter product URL (or a Best Buy SKU).
              We start checking immediately.
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
