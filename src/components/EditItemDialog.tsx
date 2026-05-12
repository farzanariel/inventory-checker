"use client";

/**
 * EditItemDialog — change intervals + note for an existing item. Submits via
 * PATCH /api/items/:id.
 *
 * Renders as a centered <Dialog> on md+ and a bottom <Drawer> on mobile.
 *
 * Controlled: parent owns open state and the item to edit.
 *
 * The form is keyed by item.id so React resets local state whenever a
 * different item is selected (no setState-in-effect needed).
 */

import { useState } from "react";
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
import { useIsDesktop } from "@/hooks/use-media-query";
import { patchItem } from "@/lib/api";
import type { Item } from "@/lib/db/schema";
import { formatPrice } from "@/lib/format";

type Props = {
  item: Item | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
};

type FormProps = {
  item: Item;
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
  const [note, setNote] = useState(item.note ?? "");
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (!stockAlert.enabled && !priceAlert.enabled) {
      setError("Enable stock alerts, price alerts, or both.");
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
        note: note.trim() || null,
        stock_alert_enabled: stockAlert.enabled,
        stock_notify_mode: stockAlert.notifyMode,
        price_alert_enabled: priceAlert.enabled,
        target_price_cents: targetCents,
        price_notify_interval_min:
          Number.parseInt(priceAlert.notifyIntervalMin, 10) || 60,
        price_notify_mode: priceAlert.notifyMode,
        price_alert_while_oos: priceAlert.whileOos,
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

  return (
    <form onSubmit={handleSubmit} className="contents">
      <div className="flex min-w-0 max-w-full flex-col gap-4 overflow-hidden">
        <div className="flex min-w-0 max-w-full gap-3 overflow-hidden rounded-lg border border-border bg-card px-3 py-2">
          {item.imageUrl ? (
            <Image
              src={item.imageUrl}
              alt={item.name ?? `SKU ${item.sku}`}
              width={56}
              height={56}
              className="size-14 shrink-0 rounded-md border border-border bg-white object-contain p-1"
            />
          ) : null}
          <div className="min-w-0 flex flex-1 flex-col gap-1">
            <div className="flex min-w-0 items-start gap-2">
              <span className="block min-w-0 flex-1 truncate text-sm" title={item.name ?? ""}>
                {item.name ?? "—"}
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                SKU {item.sku}
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
            <a
              href={item.productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block max-w-full overflow-hidden break-all font-mono text-xs leading-relaxed text-muted-foreground underline underline-offset-2 [overflow-wrap:anywhere] hover:text-foreground"
            >
              {item.productUrl}
            </a>
          </div>
        </div>

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

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-note">Note (optional)</Label>
          <textarea
            id="edit-note"
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit item</DialogTitle>
            <DialogDescription>
              Adjust check + re-notify intervals or update the note.
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
            Adjust check + re-notify intervals or update the note.
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
