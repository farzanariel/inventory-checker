"use client";

/**
 * PriceAlertSection — collapsible "Price alert" group used by both
 * AddItemDialog and EditItemDialog (NEC-11 §3 / NEC-17).
 *
 * The master <Switch> doubles as the group header: toggling it off collapses
 * the body via a 180ms grid-rows transition (CSS in globals.css). Threshold
 * inputs render inline ("[ 5 ] % or [ 10 ] $ whichever is greater") and stack
 * on viewports < 380px.
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export type PriceAlertValues = {
  enabled: boolean;
  thresholdPct: string;
  thresholdCents: string;
  notifyIntervalMin: string;
  whileOos: boolean;
};

type Props = {
  idPrefix: string;
  values: PriceAlertValues;
  onChange: (next: PriceAlertValues) => void;
  disabled?: boolean;
};

export function PriceAlertSection({
  idPrefix,
  values,
  onChange,
  disabled,
}: Props) {
  const collapsed = !values.enabled;
  const headerId = `${idPrefix}-price-alert`;
  const bodyId = `${idPrefix}-price-alert-body`;

  function set<K extends keyof PriceAlertValues>(
    key: K,
    value: PriceAlertValues[K],
  ) {
    onChange({ ...values, [key]: value });
  }

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
              <span className="text-xs text-muted-foreground">
                Notify when price drops by
              </span>
              <div className="flex flex-col min-[380px]:flex-row flex-wrap items-stretch min-[380px]:items-center gap-2 font-mono text-sm">
                <div className="flex items-center gap-1.5">
                  <Input
                    id={`${idPrefix}-price-pct`}
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min={1}
                    max={99}
                    step={1}
                    value={values.thresholdPct}
                    onChange={(e) => set("thresholdPct", e.target.value)}
                    className="w-16 font-mono tabular-nums text-base sm:text-sm"
                    disabled={disabled || !values.enabled}
                    aria-label="Percent threshold"
                  />
                  <span className="text-muted-foreground">%</span>
                </div>
                <span className="text-muted-foreground self-center">or</span>
                <div className="flex items-center gap-1.5">
                  <Input
                    id={`${idPrefix}-price-cents`}
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min={1}
                    step={1}
                    value={values.thresholdCents}
                    onChange={(e) => set("thresholdCents", e.target.value)}
                    className="w-20 font-mono tabular-nums text-base sm:text-sm"
                    disabled={disabled || !values.enabled}
                    aria-label="Dollar threshold (cents)"
                  />
                  <span className="text-muted-foreground">¢</span>
                </div>
                <span className="text-muted-foreground self-center text-xs">
                  whichever is greater
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground -mt-0.5">
                Dollar threshold is in cents (e.g. 1000 = $10.00).
              </p>
            </div>

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
  thresholdPct: "5",
  thresholdCents: "1000",
  notifyIntervalMin: "60",
  whileOos: true,
};
