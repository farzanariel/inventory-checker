"use client";

/**
 * MicroCenter per-store alert selector — shared by Add + Edit dialogs.
 *
 * Default state shows the summary line + quick-action chips (All / In-store
 * only / Online only / None). The per-store checkbox list is hidden behind a
 * "Customize per-store" disclosure since the chips cover the common cases.
 *
 * The Web Store ("029" / "Shippable Items") is pinned to the top and
 * relabelled "Online (Shippable)".
 */

import { useMemo, useState } from "react";
import { ChevronDownIcon } from "lucide-react";

import { Label } from "@/components/ui/label";

export type McStoreOption = {
  store_number: string;
  store_name: string;
  in_stock: boolean;
  qoh: number | null;
};

type Props = {
  stores: McStoreOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
};

const ONLINE_NUM = "029";

export function McStorePicker({ stores, selected, onChange, disabled }: Props) {
  const ordered = useMemo(() => {
    const online = stores.filter((s) => s.store_number === ONLINE_NUM);
    const physical = stores
      .filter((s) => s.store_number !== ONLINE_NUM)
      .slice()
      .sort((a, b) => a.store_name.localeCompare(b.store_name));
    return [...online, ...physical];
  }, [stores]);

  const total = stores.length;
  const sel = selected.size;
  const physicalNums = stores
    .filter((s) => s.store_number !== ONLINE_NUM)
    .map((s) => s.store_number);

  const summary =
    sel === 0
      ? "No stores"
      : sel === total
        ? "All stores"
        : sel === 1 && selected.has(ONLINE_NUM)
          ? "Online only"
          : sel === physicalNums.length &&
              physicalNums.every((n) => selected.has(n)) &&
              !selected.has(ONLINE_NUM)
            ? "In-store only"
            : `${sel} of ${total} stores`;

  function toggle(num: string) {
    const next = new Set(selected);
    if (next.has(num)) next.delete(num);
    else next.add(num);
    onChange(next);
  }
  function setAll() {
    onChange(new Set(stores.map((s) => s.store_number)));
  }
  function setNone() {
    onChange(new Set());
  }
  function setOnlineOnly() {
    onChange(new Set([ONLINE_NUM]));
  }
  function setInStoreOnly() {
    onChange(new Set(physicalNums));
  }

  const [expanded, setExpanded] = useState(false);

  const quickBtn =
    "rounded-md border border-input bg-input/30 px-2 py-1 font-mono text-[11px] hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Alert me on</Label>
        <span className="font-mono text-xs text-muted-foreground">{summary}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={setAll} disabled={disabled} className={quickBtn}>
          All
        </button>
        <button
          type="button"
          onClick={setInStoreOnly}
          disabled={disabled}
          className={quickBtn}
        >
          In-store only
        </button>
        <button
          type="button"
          onClick={setOnlineOnly}
          disabled={disabled}
          className={quickBtn}
        >
          Online only
        </button>
        <button type="button" onClick={setNone} disabled={disabled} className={quickBtn}>
          None
        </button>
      </div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        disabled={disabled}
        aria-expanded={expanded}
        className="flex items-center gap-1 self-start py-0.5 font-mono text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <ChevronDownIcon
          className={`size-3 transition-transform ${expanded ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
        {expanded ? "Hide stores" : `Customize per-store (${total})`}
      </button>
      {expanded ? (
        <div className="max-h-56 overflow-y-auto rounded-md border border-border bg-background">
          {ordered.map((s, idx) => {
            const isOnline = s.store_number === ONLINE_NUM;
            const checked = selected.has(s.store_number);
            const label = isOnline ? "Online (Shippable)" : s.store_name;
            const dotColor = s.in_stock
              ? "var(--color-status-ok, #22c55e)"
              : "var(--color-muted-foreground, #888)";
            return (
              <label
                key={s.store_number}
                className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm hover:bg-accent/40 ${
                  isOnline && idx === 0 ? "border-b border-border" : ""
                } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(s.store_number)}
                  disabled={disabled}
                  className="size-4 shrink-0"
                />
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: dotColor }}
                  aria-hidden="true"
                  title={
                    s.in_stock
                      ? s.qoh != null
                        ? `${s.qoh} in stock`
                        : "in stock"
                      : "out of stock"
                  }
                />
                <span className="flex-1 truncate">{label}</span>
                {s.in_stock && s.qoh != null ? (
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                    qty {s.qoh}
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
