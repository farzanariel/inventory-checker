"use client";

/**
 * EditItemDialog — change alert config for an existing item. Submits
 * via PATCH /api/items/:id.
 *
 * For MicroCenter items, also fetches per-store alert state via GET
 * /api/items/:id (which returns the joined `stores` array) and renders the
 * <McStorePicker> so the user can change which stores fire alerts.
 *
 * Renders as a centered <Dialog> on md+ and a bottom <Drawer> on mobile.
 *
 * Controlled: parent owns open state and the item to edit.
 *
 * The form is keyed by item.id so React resets local state whenever a
 * different item is selected (no setState-in-effect needed).
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
import { Label } from "@/components/ui/label";
import {
  PriceAlertSection,
  type PriceAlertValues,
} from "@/components/PriceAlertSection";
import {
  StockAlertSection,
  type StockAlertValues,
} from "@/components/StockAlertSection";
import {
  McStorePicker,
  type McStoreOption,
} from "@/components/McStorePicker";
import { useIsDesktop } from "@/hooks/use-media-query";
import { fetchItem, patchItem, type ItemWithDeals } from "@/lib/api";
import type { ItemStore } from "@/lib/db/schema";
import { DealsPanel } from "@/components/DealsPanel";
import { formatPrice } from "@/lib/format";

type Props = {
  item: ItemWithDeals | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
};

type FormProps = {
  item: ItemWithDeals;
  onClose: () => void;
  onSaved?: () => void;
  submitSize: "sm" | "lg";
};

function EditFormBody({ item, onClose, onSaved, submitSize }: FormProps) {
  const [stockAlert, setStockAlert] = useState<StockAlertValues>({
    enabled: item.stockAlertEnabled === 1,
    checkIntervalMin: String(item.checkIntervalMin),
    restockIntervalMin: String(item.restockNotifyIntervalMin),
    notifyMode: (item.stockNotifyMode as "once" | "repeat") ?? "repeat",
  });
  const [priceAlert, setPriceAlert] = useState<PriceAlertValues>({
    enabled: item.priceAlertEnabled === 1,
    targetDollars:
      item.targetPriceCents != null
        ? (item.targetPriceCents / 100).toFixed(2)
        : "",
    notifyIntervalMin: String(item.priceNotifyIntervalMin),
    notifyMode: (item.priceNotifyMode as "once" | "repeat") ?? "repeat",
    whileOos: item.priceAlertWhileOos === 1,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // MicroCenter per-store state. Fetched lazily on mount for MC items.
  const isMc = item.retailer === "microcenter";
  const [mcStores, setMcStores] = useState<ItemStore[] | null>(null);
  const [mcEnabledStores, setMcEnabledStores] = useState<Set<string>>(new Set());
  const [mcLoading, setMcLoading] = useState(isMc);
  const [mcError, setMcError] = useState<string | null>(null);

  useEffect(() => {
    if (!isMc) return;
    const controller = new AbortController();
    (async () => {
      try {
        const full = await fetchItem(item.id, controller.signal);
        const stores = full.stores ?? [];
        setMcStores(stores);
        setMcEnabledStores(
          new Set(
            stores.filter((s) => s.alertEnabled === 1).map((s) => s.storeNumber),
          ),
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const message =
          err instanceof Error ? err.message : "Failed to load store list";
        setMcError(message);
      } finally {
        if (!controller.signal.aborted) setMcLoading(false);
      }
    })();
    return () => controller.abort();
  }, [isMc, item.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (!stockAlert.enabled && !priceAlert.enabled) {
      setError("Enable stock alerts, price alerts, or both.");
      return;
    }
    if (isMc && mcStores && mcEnabledStores.size === 0) {
      setError("Pick at least one MicroCenter store to alert on.");
      return;
    }
    setSubmitting(true);
    try {
      const targetDollarsNum = Number.parseFloat(priceAlert.targetDollars);
      const targetCents =
        priceAlert.targetDollars.trim() !== "" && Number.isFinite(targetDollarsNum)
          ? Math.round(targetDollarsNum * 100)
          : null;
      await patchItem(item.id, {
        check_interval_min: Number.parseInt(stockAlert.checkIntervalMin, 10) || 1,
        restock_notify_interval_min:
          Number.parseInt(stockAlert.restockIntervalMin, 10) || 10,
        stock_alert_enabled: stockAlert.enabled,
        stock_notify_mode: stockAlert.notifyMode,
        price_alert_enabled: priceAlert.enabled,
        target_price_cents: targetCents,
        price_notify_interval_min:
          Number.parseInt(priceAlert.notifyIntervalMin, 10) || 60,
        price_notify_mode: priceAlert.notifyMode,
        price_alert_while_oos: priceAlert.whileOos,
        ...(isMc && mcStores
          ? { enabled_store_numbers: [...mcEnabledStores] }
          : {}),
      });
      toast.success("Saved changes");
      onSaved?.();
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save changes";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const FooterEl = submitSize === "lg" ? DrawerFooter : DialogFooter;
  const buttonHeight = submitSize === "lg" ? "h-11 active:scale-[0.98]" : "";

  const mcOptions: McStoreOption[] | null = mcStores
    ? mcStores.map((s) => ({
        store_number: s.storeNumber,
        store_name: s.storeName,
        in_stock: s.lastStockStatus === "IN_STOCK",
        qoh: s.lastQoh,
      }))
    : null;

  const idLabel =
    item.retailer === "microcenter"
      ? `MC ${item.mcProductId}`
      : `SKU ${item.sku}`;

  return (
    <form onSubmit={handleSubmit} className="contents">
      <div className="flex min-w-0 max-w-full flex-col gap-5 overflow-hidden">
        <div className="flex min-w-0 max-w-full gap-3 overflow-hidden rounded-lg border border-[var(--surface-recessed-border)] bg-[var(--surface-recessed)] px-3 py-2.5">
          {item.imageUrl ? (
            <Image
              src={item.imageUrl}
              alt={item.name ?? idLabel}
              width={56}
              height={56}
              unoptimized={item.retailer === "microcenter"}
              className="size-14 shrink-0 rounded-md border border-border bg-white object-contain p-1"
            />
          ) : null}
          <div className="min-w-0 flex flex-1 flex-col gap-1">
            <div className="flex min-w-0 items-start gap-2">
              <a
                href={item.productUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block min-w-0 flex-1 truncate text-sm font-medium underline-offset-2 hover:underline"
                title={item.name ?? ""}
              >
                {item.name ?? "—"}
              </a>
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                {idLabel}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-xs text-muted-foreground">
              {item.brand ? <span>{item.brand}</span> : null}
              {item.brand ? <span aria-hidden="true">·</span> : null}
              <span className="tabular-nums">
                {formatPrice(item.currentPriceCents)}
              </span>
              {item.lastButtonState ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{item.lastButtonState.replaceAll("_", " ")}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {isMc ? (
          mcLoading ? (
            <p className="font-mono text-xs text-muted-foreground">
              Loading store list…
            </p>
          ) : mcError ? (
            <p
              className="font-mono text-xs"
              style={{ color: "var(--color-status-error)" }}
              role="status"
            >
              {mcError}
            </p>
          ) : mcOptions && mcOptions.length > 0 ? (
            <McStorePicker
              stores={mcOptions}
              selected={mcEnabledStores}
              onChange={setMcEnabledStores}
              disabled={submitting}
            />
          ) : null
        ) : null}

        {item.retailer === "bestbuy" ? <DealsPanel item={item} /> : null}

        <StockAlertSection
          idPrefix="edit"
          values={stockAlert}
          onChange={setStockAlert}
          disabled={submitting}
        />

        <PriceAlertSection
          idPrefix="edit"
          values={priceAlert}
          onChange={setPriceAlert}
          currentPriceCents={item.currentPriceCents}
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

      <FooterEl>
        <Button
          type="button"
          variant="outline"
          size={submitSize}
          className={buttonHeight}
          onClick={onClose}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size={submitSize}
          className={buttonHeight}
          disabled={submitting}
        >
          {submitting ? "Saving…" : "Save"}
        </Button>
      </FooterEl>
    </form>
  );
}

export function EditItemDialog({ item, open, onOpenChange, onSaved }: Props) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit item</DialogTitle>
            <DialogDescription>
              Adjust alerts or intervals.
            </DialogDescription>
          </DialogHeader>
          {item ? (
            <EditFormBody
              key={item.id}
              item={item}
              onClose={() => onOpenChange(false)}
              onSaved={onSaved}
              submitSize="sm"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Edit item</DrawerTitle>
          <DrawerDescription>
            Adjust alerts or intervals.
          </DrawerDescription>
        </DrawerHeader>
        {item ? (
          <EditFormBody
            key={item.id}
            item={item}
            onClose={() => onOpenChange(false)}
            onSaved={onSaved}
            submitSize="lg"
          />
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
