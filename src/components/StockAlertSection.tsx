"use client";

/**
 * StockAlertSection — flat layout, no box. Toggle inline with the heading,
 * primary inputs visible when enabled, notify-mode radios behind "Advanced".
 */

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { NotifyMode } from "@/components/PriceAlertSection";

export type StockAlertValues = {
  enabled: boolean;
  checkIntervalMin: string;
  restockIntervalMin: string;
  notifyMode: NotifyMode;
};

type Props = {
  idPrefix: string;
  values: StockAlertValues;
  onChange: (next: StockAlertValues) => void;
  disabled?: boolean;
};

export function StockAlertSection({
  idPrefix,
  values,
  onChange,
  disabled,
}: Props) {
  const headerId = `${idPrefix}-stock-alert`;
  const bodyId = `${idPrefix}-stock-alert-body`;
  const [showAdvanced, setShowAdvanced] = useState(false);

  function set<K extends keyof StockAlertValues>(
    key: K,
    value: StockAlertValues[K],
  ) {
    onChange({ ...values, [key]: value });
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <Label
          htmlFor={headerId}
          className="cursor-pointer text-sm font-medium"
        >
          Stock alerts
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
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor={`${idPrefix}-check-interval`}
                  className="text-xs text-muted-foreground"
                >
                  Check every (min)
                </Label>
                <Input
                  id={`${idPrefix}-check-interval`}
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min={1}
                  max={60}
                  step={1}
                  value={values.checkIntervalMin}
                  onChange={(e) => set("checkIntervalMin", e.target.value)}
                  className="font-mono tabular-nums text-base sm:text-sm"
                  disabled={disabled || !values.enabled}
                />
              </div>
              {values.notifyMode === "repeat" ? (
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor={`${idPrefix}-restock-interval`}
                    className="text-xs text-muted-foreground"
                  >
                    Re-notify every (min)
                  </Label>
                  <Input
                    id={`${idPrefix}-restock-interval`}
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min={1}
                    max={1440}
                    step={1}
                    value={values.restockIntervalMin}
                    onChange={(e) => set("restockIntervalMin", e.target.value)}
                    className="font-mono tabular-nums text-base sm:text-sm"
                    disabled={disabled || !values.enabled}
                  />
                </div>
              ) : null}
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
                      name={`${idPrefix}-stock-mode`}
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
                      name={`${idPrefix}-stock-mode`}
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
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export const STOCK_ALERT_DEFAULTS: StockAlertValues = {
  enabled: false,
  checkIntervalMin: "1",
  restockIntervalMin: "10",
  notifyMode: "repeat",
};
