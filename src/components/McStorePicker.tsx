"use client";

/**
 * MicroCenter per-store alert selector — shared by Add + Edit dialogs.
 *
 * Default state shows the summary line + quick-action chips (All / None).
 * The per-store checkbox list is hidden behind a
 * "Customize per-store" disclosure since the chips cover the common cases.
 *
 * Online shipping ("029" / "Shippable Items") is displayed in the product
 * summary instead of this picker; this control is for physical stores only.
 */

import { useMemo, useState } from "react";
import { ChevronDownIcon, ExternalLinkIcon } from "lucide-react";

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
  productUrl?: string;
  disabled?: boolean;
};

function microCenterStoreUrl(productUrl: string, storeNumber: string): string {
  const url = new URL(productUrl);
  url.searchParams.set("storeid", storeNumber);
  return url.toString();
}

export function McStorePicker({
  stores,
  selected,
  onChange,
  productUrl,
  disabled,
}: Props) {
  const ordered = useMemo(() => {
    return stores
      .slice()
      .sort((a, b) => {
        if (a.in_stock !== b.in_stock) return a.in_stock ? -1 : 1;
        return a.store_name.localeCompare(b.store_name);
      });
  }, [stores]);

  const total = stores.length;
  const sel = selected.size;

  const summary =
    sel === 0
      ? "No stores"
      : sel === total
        ? "All stores"
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
      <div
        inert={expanded ? undefined : true}
        aria-hidden={!expanded}
        className={`grid transition-[grid-template-rows,opacity,transform] duration-200 ease-out ${
          expanded
            ? "grid-rows-[1fr] translate-y-0 opacity-100"
            : "grid-rows-[0fr] -translate-y-1 opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="max-h-56 overflow-y-auto rounded-md border border-border bg-background">
            {ordered.map((s, idx) => {
              const checked = selected.has(s.store_number);
              const label = s.store_name;
              const storeUrl = productUrl
                ? microCenterStoreUrl(productUrl, s.store_number)
                : null;
              const dotColor = s.in_stock
                ? "var(--color-status-ok, #22c55e)"
                : "var(--color-muted-foreground, #888)";
              return (
                <label
                  key={s.store_number}
                  className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm hover:bg-accent/40 ${
                    idx > 0 && ordered[idx - 1]?.in_stock !== s.in_stock
                      ? "border-t border-border"
                      : ""
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
                  {storeUrl ? (
                    <a
                      href={storeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex min-w-0 flex-1 items-center gap-1 truncate underline-offset-2 hover:underline"
                      title={`${label} store page`}
                    >
                      <span className="truncate">{label}</span>
                      <ExternalLinkIcon className="size-3 shrink-0" aria-hidden="true" />
                    </a>
                  ) : (
                    <span className="flex-1 truncate">{label}</span>
                  )}
                  {s.in_stock && s.qoh != null ? (
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                      qty {s.qoh}
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
