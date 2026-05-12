"use client";

/**
 * PriceAlertSection — collapsible "Price alert" group used by Add + Edit.
 *
 * SPEC §19 v5 (NEC-10 follow-up): single dollar target. The master <Switch>
 * doubles as the group header; toggling it off collapses the body.
 *
 * Current-price-aware: when the dialog knows the current price, the target
 * input shows it as context ("Currently $159.99") and warns when the target
 * is at or above current (the alert would fire immediately, which is almost
 * certainly not what the user wanted).
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatPrice } from "@/lib/format";

export type NotifyMode = "once" | "repeat";

export type PriceAlertValues = {
  enabled: boolean;
  /** Target price as a user-entered dollar string (e.g. "129.99"). Empty = no target set. */
  targetDollars: string;
  notifyIntervalMin: string;
  notifyMode: NotifyMode;
  whileOos: boolean;
};

type Props = {
  idPrefix: string;
  values: PriceAlertValues;
  onChange: (next: PriceAlertValues) => void;
  /** Current observed price in cents. `null` when unknown (item just added, lookup failed). */
  currentPriceCents?: number | null;
  disabled?: boolean;
};

export function PriceAlertSection({
  idPrefix,
  values,
  onChange,
  currentPriceCents,
  disabled,
}: Props) {
  const collapsed = !values.enabled;
  const headerId = `${idPrefix}-price-alert`;
  const bodyId = `${idPrefix}-price-alert-body`;
  const targetId = `${idPrefix}-price-target`;

  function set<K extends keyof PriceAlertValues>(
    key: K,
    value: PriceAlertValues[K],
  ) {
    onChange({ ...values, [key]: value });
  }

  // Validation hints — soft, not blocking.
  const parsedTarget = Number.parseFloat(values.targetDollars);
  const targetCents =
    values.targetDollars.trim() !== "" && Number.isFinite(parsedTarget)
      ? Math.round(parsedTarget * 100)
      : null;
  const targetTooHigh =
    currentPriceCents != null &&
    targetCents != null &&
    targetCents >= currentPriceCents;
  const targetBlank = values.targetDollars.trim() === "" && values.enabled;

  return (
    <div className="rounded-lg border border-border bg-card/40 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <Label
          htmlFor={headerId}
          className="cursor-pointer text-sm font-medium"
        >
          Price alert
        </Label>
        <Switch
          id={headerId}
          checked={values.enabled}
          onCheckedChange={(next: boolean) => set("enabled", next)}
          disabled={disabled}
          aria-controls={bodyId}
          aria-expanded={values.enabled}
        />
      </div>

      <div
        className="price-alert-collapsible"
        data-collapsed={collapsed ? "true" : "false"}
        aria-hidden={collapsed}
      >
        <div
          id={bodyId}
          className="price-alert-collapsible-inner"
          inert={collapsed || undefined}
        >
          <div className="flex flex-col gap-3 pt-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={targetId} className="text-xs">
                Alert when price drops to (optional)
              </Label>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-base sm:text-sm text-muted-foreground">$</span>
                <Input
                  id={targetId}
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  placeholder={
                    currentPriceCents != null
                      ? (currentPriceCents * 0.9 / 100).toFixed(2)
                      : "0.00"
                  }
                  value={values.targetDollars}
                  onChange={(e) => set("targetDollars", e.target.value)}
                  className="w-28 font-mono tabular-nums text-base sm:text-sm"
                  disabled={disabled || !values.enabled}
                  aria-invalid={targetTooHigh || undefined}
                  aria-describedby={`${targetId}-hint`}
                />
                {currentPriceCents != null ? (
                  <span className="font-mono text-xs text-muted-foreground">
                    currently {formatPrice(currentPriceCents)}
                  </span>
                ) : null}
              </div>
              <p
                id={`${targetId}-hint`}
                className="text-[11px] font-mono"
                style={{
                  color: targetTooHigh
                    ? "var(--color-status-error)"
                    : "var(--muted-foreground)",
                }}
                role={targetTooHigh ? "alert" : undefined}
              >
                {targetTooHigh
                  ? `Target $${(targetCents! / 100).toFixed(2)} is at or above the current price — alert would fire immediately. Pick a lower number.`
                  : targetBlank
                    ? "Leave blank to be notified on any price drop from the most recent price."
                    : currentPriceCents != null
                      ? "We'll ping you on Discord when the price hits this target (or any lower)."
                      : "Enter a dollar amount (e.g. 129.99), or leave blank to alert on any drop."}
              </p>
            </div>

            <fieldset className="flex flex-col gap-1.5" disabled={disabled || !values.enabled}>
              <legend className="text-xs">Notify mode</legend>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-sm select-none">
                  <input
                    type="radio"
                    name={`${idPrefix}-price-mode`}
                    value="once"
                    checked={values.notifyMode === "once"}
                    onChange={() => set("notifyMode", "once")}
                    disabled={disabled || !values.enabled}
                    className="size-4 cursor-pointer accent-foreground"
                  />
                  Once
                </label>
                <label className="flex items-center gap-1.5 text-sm select-none">
                  <input
                    type="radio"
                    name={`${idPrefix}-price-mode`}
                    value="repeat"
                    checked={values.notifyMode === "repeat"}
                    onChange={() => set("notifyMode", "repeat")}
                    disabled={disabled || !values.enabled}
                    className="size-4 cursor-pointer accent-foreground"
                  />
                  Keep notifying
                </label>
              </div>
            </fieldset>

            {values.notifyMode === "repeat" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${idPrefix}-price-interval`} className="text-xs">
                  Re-notify on price drops every (min)
                </Label>
                <Input
                  id={`${idPrefix}-price-interval`}
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min={1}
                  max={10080}
                  step={1}
                  value={values.notifyIntervalMin}
                  onChange={(e) => set("notifyIntervalMin", e.target.value)}
                  className="w-28 font-mono tabular-nums text-base sm:text-sm"
                  disabled={disabled || !values.enabled}
                />
              </div>
            ) : null}

            <label className="flex items-center gap-2 text-sm select-none">
              <input
                type="checkbox"
                checked={values.whileOos}
                onChange={(e) => set("whileOos", e.target.checked)}
                disabled={disabled || !values.enabled}
                className="size-4 cursor-pointer rounded border-border bg-input/60 accent-foreground"
              />
              <span>Alert on price drops while out of stock</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

export const PRICE_ALERT_DEFAULTS: PriceAlertValues = {
  enabled: true,
  targetDollars: "",
  notifyIntervalMin: "60",
  notifyMode: "repeat",
  whileOos: true,
};
