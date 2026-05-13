"use client";

/**
 * PriceAlertSection — flat layout, no box. Toggle inline with the heading;
 * target-price input is the primary control; notify-mode + re-notify
 * interval + while-OOS are tucked behind an "Advanced" disclosure.
 *
 * Current-price-aware: when the dialog knows the current price, the target
 * input shows it as context and warns when the target is at or above current.
 */

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";

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
  const headerId = `${idPrefix}-price-alert`;
  const bodyId = `${idPrefix}-price-alert-body`;
  const targetId = `${idPrefix}-price-target`;
  const [showAdvanced, setShowAdvanced] = useState(false);

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
    <div className="flex flex-col gap-2.5">
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
        data-collapsed={values.enabled ? "false" : "true"}
        aria-hidden={!values.enabled}
      >
        <div
          id={bodyId}
          className="price-alert-collapsible-inner"
          inert={!values.enabled || undefined}
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor={targetId}
                className="text-xs text-muted-foreground"
              >
                Alert when price drops to (optional)
              </Label>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-base sm:text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  id={targetId}
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  placeholder={
                    currentPriceCents != null
                      ? ((currentPriceCents * 0.9) / 100).toFixed(2)
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

            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              disabled={disabled || !values.enabled}
              aria-expanded={showAdvanced}
              className="flex items-center gap-1 self-start py-0.5 font-mono text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <ChevronDownIcon
                className={`size-3 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
              {showAdvanced ? "Hide advanced" : "Advanced"}
            </button>

            {showAdvanced ? (
              <div className="flex flex-col gap-3">
                <fieldset
                  className="flex flex-col gap-1.5"
                  disabled={disabled || !values.enabled}
                >
                  <legend className="text-xs text-muted-foreground">
                    Notify mode
                  </legend>
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
                    <Label
                      htmlFor={`${idPrefix}-price-interval`}
                      className="text-xs text-muted-foreground"
                    >
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
            ) : null}
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
