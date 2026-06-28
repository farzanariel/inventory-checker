"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CheckIcon,
  CopyIcon,
  ListPlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  addProxies,
  clearSavedProxies,
  fetchProxies,
  removeProxy,
  replaceProxies,
  type ProxyEntry,
} from "@/lib/api";

function toLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatProxy(proxy: ProxyEntry): string {
  if (proxy.username !== null) {
    return `${proxy.host}:${proxy.port}:${proxy.username}:${proxy.password ?? ""}`;
  }
  return `${proxy.host}:${proxy.port}`;
}

function maskPassword(password: string | null): string {
  if (password === null) return "";
  if (password.length <= 2) return "*".repeat(password.length);
  return `${password.slice(0, 1)}${"*".repeat(Math.min(8, password.length - 2))}${password.slice(-1)}`;
}

export function ProxySettingsForm() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [proxies, setProxies] = useState<ProxyEntry[]>([]);

  const proxyText = useMemo(() => proxies.map(formatProxy).join("\n"), [proxies]);

  useEffect(() => {
    let cancelled = false;
    fetchProxies()
      .then((res) => {
        if (cancelled) return;
        setProxies(res.proxies);
        setLoadError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const lines = toLines(bulkText);
    if (lines.length === 0) {
      toast.error("Paste at least one proxy");
      return;
    }

    setSaving(true);
    try {
      const res = await addProxies(lines);
      setProxies(res.proxies);
      setBulkText("");
      toast.success(`Added ${res.added ?? lines.length} proxy${(res.added ?? lines.length) === 1 ? "" : "ies"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleReplace() {
    if (saving) return;
    const lines = toLines(bulkText);
    if (lines.length === 0) {
      toast.error("Paste at least one proxy");
      return;
    }

    setSaving(true);
    try {
      const res = await replaceProxies(lines);
      setProxies(res.proxies);
      setBulkText("");
      toast.success(`Saved ${res.total ?? lines.length} proxy${(res.total ?? lines.length) === 1 ? "" : "ies"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Replace failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(index: number) {
    if (saving) return;
    setSaving(true);
    try {
      const res = await removeProxy(index);
      setProxies(res.proxies);
      toast.success("Proxy removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    if (saving || proxies.length === 0) return;
    if (!window.confirm("Clear all saved proxies?")) return;
    setSaving(true);
    try {
      const res = await clearSavedProxies();
      setProxies(res.proxies);
      toast.success("Proxy list cleared");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Clear failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleCopy() {
    if (proxyText.length === 0) return;
    try {
      await navigator.clipboard.writeText(proxyText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
      toast.success("Proxy list copied");
    } catch {
      toast.error("Copy failed");
    }
  }

  if (loading) {
    return (
      <p className="font-mono text-xs text-muted-foreground">Loading proxies...</p>
    );
  }

  if (loadError) {
    return (
      <p className="font-mono text-xs" style={{ color: "var(--color-status-error)" }}>
        {loadError}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <form onSubmit={handleAdd} className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium text-foreground">Proxy List</h2>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              host:port:user:pass, user:pass@host:port, or host:port
            </p>
          </div>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {proxies.length} saved
          </span>
        </div>

        <textarea
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          placeholder="proxy1.example.com:8000:user:pass&#10;user:pass@proxy2.example.com:9000"
          spellCheck={false}
          disabled={saving}
          className="min-h-44 w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-sm leading-6 outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 dark:bg-input/30"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={saving}>
            <ListPlusIcon className="size-3.5" aria-hidden="true" />
            Add
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={handleReplace}
          >
            <RotateCcwIcon className="size-3.5" aria-hidden="true" />
            Replace all
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={proxies.length === 0}
            onClick={handleCopy}
          >
            {copied ? (
              <CheckIcon className="size-3.5" aria-hidden="true" />
            ) : (
              <CopyIcon className="size-3.5" aria-hidden="true" />
            )}
            Copy all
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={saving || proxies.length === 0}
            onClick={handleClear}
            className="ml-auto"
          >
            <Trash2Icon className="size-3.5" aria-hidden="true" />
            Clear
          </Button>
        </div>
      </form>

      <section className="overflow-hidden rounded-lg border border-border">
        {proxies.length === 0 ? (
          <div className="px-4 py-10 text-center font-mono text-xs text-muted-foreground">
            No proxies saved
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {proxies.map((proxy, index) => (
              <li
                key={proxy.id}
                className="grid min-h-11 grid-cols-[1fr_auto] items-center gap-3 px-3 py-2"
              >
                <div className="min-w-0 font-mono text-xs">
                  <span className="text-foreground">{proxy.host}</span>
                  <span className="text-muted-foreground">:{proxy.port}</span>
                  {proxy.username !== null ? (
                    <span className="text-muted-foreground">
                      :{proxy.username}:{maskPassword(proxy.password)}
                    </span>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove proxy ${index + 1}`}
                  title="Remove proxy"
                  disabled={saving}
                  onClick={() => void handleRemove(index)}
                >
                  <Trash2Icon className="size-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex items-center">
        <Link href="/" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
