"use client";

/**
 * HeaderBar — sticky top bar.
 *
 * - Title + watching count on the left
 * - Worker health indicator (only when not OK)
 * - Test notification + Add item buttons on the right
 *
 * Polls /api/health every 10s. Items are owned by the parent Dashboard.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MoonIcon, PlusIcon, RefreshCwIcon, SettingsIcon, ShieldIcon, SunIcon } from "lucide-react";
import { AddItemDialog } from "@/components/AddItemDialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { triggerDealsSync, type HealthResponse } from "@/lib/api";

type Props = {
  watchingCount: number;
  lastSyncAt: number | null;
  onAdded: () => void;
};

type HealthState =
  | { kind: "ok"; ageMs: number }
  | { kind: "stale"; ageMs: number }
  | { kind: "down" };

function classifyHealth(res: HealthResponse, httpStatus: number): HealthState {
  if (httpStatus === 503 || res.status === "degraded") {
    if (res.worker_last_tick_age_ms == null) return { kind: "down" };
    return { kind: "stale", ageMs: res.worker_last_tick_age_ms };
  }
  return { kind: "ok", ageMs: res.worker_last_tick_age_ms ?? 0 };
}

export function HeaderBar({ watchingCount, lastSyncAt, onAdded }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [health, setHealth] = useState<HealthState | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [scrolled, setScrolled] = useState(false);
  // Read the dark-class on <html> that next-themes manages, so we don't
  // import next-themes statically (which puts it in the SSR bundle and causes
  // a useContext(null) crash during the static-generation build phase).
  const [isDark, setIsDark] = useState(false);
  const [themeMounted, setThemeMounted] = useState(false);
  useEffect(() => {
    const html = document.documentElement;
    // Sync with DOM state on mount; sync setState in effect is intentional here
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(html.classList.contains("dark"));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeMounted(true);
    const obs = new MutationObserver(() =>
      setIsDark(html.classList.contains("dark"))
    );
    obs.observe(html, { attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  // Poll /api/health every 10s
  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();

    const tick = async () => {
      try {
        const res = await fetch("/api/health", {
          cache: "no-store",
          signal: ac.signal,
        });
        const text = await res.text();
        const body = text
          ? (JSON.parse(text) as HealthResponse)
          : ({
              status: "degraded",
              worker_last_tick_age_ms: null,
              items_checked_last: null,
              last_tick_at: null,
            } satisfies HealthResponse);
        if (cancelled) return;
        setHealth(classifyHealth(body, res.status));
      } catch {
        if (cancelled) return;
        setHealth({ kind: "down" });
      }
    };

    tick();
    const id = window.setInterval(tick, 10_000);
    return () => {
      cancelled = true;
      ac.abort();
      window.clearInterval(id);
    };
  }, []);

  // Tick "synced Xs ago" once per second
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Track scroll past first 16px to bump the header bottom-border opacity.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  async function handleSyncDeals() {
    if (syncing) return;
    setSyncing(true);
    try {
      const r = await triggerDealsSync();
      if (r.skipped === "unchanged") {
        toast.success("Deals: feed unchanged");
      } else if (r.ok) {
        toast.success(
          `Deals synced: ${r.matchedItemCount ?? 0} items matched, ${r.matchedDealRows ?? 0} rows`,
        );
        onAdded();
      } else {
        toast.error(`Deals sync failed: ${r.error ?? "unknown"}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      toast.error(message);
    } finally {
      setSyncing(false);
    }
  }

// Health colour + label. Compact on mobile (dot only), inline label on desktop.
  const healthMeta = (() => {
    if (!health || health.kind === "ok") return null;
    if (health.kind === "stale") {
      const seconds = Math.round(health.ageMs / 1000);
      return {
        color: "var(--color-status-degraded)",
        label: `Worker stale · ${seconds}s`,
        srLabel: `Worker stale, ${seconds} seconds since last tick`,
      };
    }
    return {
      color: "var(--color-status-error)",
      label: "Worker down",
      srLabel: "Worker down",
    };
  })();

  // synced indicator (desktop only — hidden on mobile to save real estate)
  const syncedLabel = (() => {
    if (lastSyncAt == null) return null;
    const ageMs = Math.max(0, now - lastSyncAt);
    if (ageMs < 1500) return "synced just now";
    return `synced ${Math.round(ageMs / 1000)}s ago`;
  })();

  return (
    <>
      <header
        className={`sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md supports-backdrop-filter:bg-background/65 transition-colors duration-150 safe-pt ${
          scrolled ? "header-scrolled" : ""
        }`}
      >
        <div className="mx-auto flex max-w-[1200px] min-h-14 items-center gap-3 px-4 py-3 md:gap-4 md:px-6 md:py-4">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-base font-medium tracking-tight text-foreground">
              <span className="md:hidden">Inventory</span>
              <span className="hidden md:inline">Inventory Monitor</span>
            </h1>
            <span className="hidden md:inline-flex font-mono text-xs tabular-nums text-muted-foreground whitespace-nowrap items-center gap-1.5">
              <span
                className="size-1.5 rounded-full bg-foreground/40"
                aria-hidden="true"
              />
              {watchingCount} watching
            </span>
            {healthMeta ? (
              <>
                <span
                  aria-hidden="true"
                  className="hidden md:inline text-muted-foreground"
                >
                  ·
                </span>
                <span
                  className="inline-flex items-center gap-1.5 font-mono text-xs"
                  style={{ color: healthMeta.color }}
                  title={healthMeta.srLabel}
                  aria-label={healthMeta.srLabel}
                >
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: healthMeta.color }}
                    aria-hidden="true"
                  />
                  <span className="hidden md:inline">{healthMeta.label}</span>
                </span>
              </>
            ) : null}
          </div>

          <div className="ml-auto flex items-center gap-1.5 md:gap-2">
            {syncedLabel ? (
              <span className="hidden md:inline font-mono text-[11px] tabular-nums text-muted-foreground">
                {syncedLabel}
              </span>
            ) : null}

            {/* Deals sync — icon-only, refresh icon spins while syncing. */}
            <Button
              variant="outline"
              size="icon-sm"
              onClick={handleSyncDeals}
              disabled={syncing}
              aria-label={syncing ? "Syncing deals" : "Sync deals now"}
              title="Sync deals"
              className="active:scale-[0.97]"
            >
              <RefreshCwIcon
                className={`size-4 ${syncing ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
            </Button>

            {/* Theme toggle. Renders neutral placeholder pre-mount to avoid hydration flicker. */}
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => {
                const newTheme = isDark ? "light" : "dark";
                document.documentElement.classList.toggle("dark", newTheme === "dark");
                try {
                  localStorage.setItem("theme", newTheme);
                } catch { /* ignore quota errors */ }
              }}
              aria-label={
                themeMounted
                  ? `Switch to ${isDark ? "light" : "dark"} mode`
                  : "Toggle theme"
              }
              className="active:scale-[0.97]"
            >
              {themeMounted && isDark ? (
                <SunIcon className="size-4" aria-hidden="true" />
              ) : (
                <MoonIcon className="size-4" aria-hidden="true" />
              )}
            </Button>

            <Link
              href="/proxies"
              aria-label="Proxies"
              title="Proxies"
              className={`${buttonVariants({ variant: "outline", size: "icon-sm" })} active:scale-[0.97]`}
            >
              <ShieldIcon className="size-4" aria-hidden="true" />
            </Link>

            {/* Settings: gear icon link to /settings */}
            <Link
              href="/settings"
              aria-label="Settings"
              className={`${buttonVariants({ variant: "outline", size: "icon-sm" })} active:scale-[0.97]`}
            >
              <SettingsIcon className="size-4" aria-hidden="true" />
            </Link>

            {/* Add item: text button on desktop. Hidden on mobile — replaced by FAB. */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddOpen(true)}
              className="hidden md:inline-flex active:scale-[0.97]"
            >
              <PlusIcon className="size-3.5" aria-hidden="true" />
              Add item
            </Button>
          </div>
        </div>
      </header>

      <AddItemDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={onAdded}
      />
    </>
  );
}
