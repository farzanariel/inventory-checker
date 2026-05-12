"use client";

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

export function StockAlertSection({ idPrefix, values, onChange, disabled }: Props) {
  const collapsed = !values.enabled;
  const headerId = `${idPrefix}-stock-alert`;
  const bodyId = `${idPrefix}-stock-alert-body`;

  function set<K extends keyof StockAlertValues>(key: K, value: StockAlertValues[K]) {
    onChange({ ...values, [key]: value });
  }

  return (
    <div className="rounded-lg border border-border bg-card/40 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={headerId} className="cursor-pointer text-sm font-medium">
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
        data-collapsed={collapsed ? "true" : "false"}
        aria-hidden={collapsed}
      >
        <div
          id={bodyId}
          className="price-alert-collapsible-inner"
          inert={collapsed || undefined}
        >
          <div className="flex flex-col gap-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${idPrefix}-check-interval`} className="text-xs">
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
                  <Label htmlFor={`${idPrefix}-restock-interval`} className="text-xs">
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

            <fieldset className="flex flex-col gap-1.5" disabled={disabled || !values.enabled}>
              <legend className="text-xs">Notify mode</legend>
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
          </div>
        </div>
      </div>
    </div>
  );
}

export const STOCK_ALERT_DEFAULTS: StockAlertValues = {
  enabled: true,
  checkIntervalMin: "1",
  restockIntervalMin: "10",
  notifyMode: "repeat",
};
