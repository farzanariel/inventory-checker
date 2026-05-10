"use client";

/**
 * SettingsForm — edit Discord webhook URL + username, plus an inline Test
 * button that pings the unsaved values so you can verify before saving.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  fetchSettings,
  saveSettings,
  testNotification,
  type SettingsResponse,
} from "@/lib/api";

const WEBHOOK_PREFIX = "https://discord.com/api/webhooks/";

export function SettingsForm() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [envFallback, setEnvFallback] = useState(false);

  const [webhookUrl, setWebhookUrl] = useState("");
  const [username, setUsername] = useState("");

  function applyResponse(res: SettingsResponse) {
    setWebhookUrl(res.stored.discord_webhook_url);
    setUsername(res.stored.discord_username);
    setEnvFallback(res.env_webhook_url_present);
  }

  useEffect(() => {
    let cancelled = false;
    fetchSettings()
      .then((res) => {
        if (cancelled) return;
        applyResponse(res);
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

  function validateWebhookUrlField(): string | null {
    const v = webhookUrl.trim();
    if (v === "") return null;
    if (!v.startsWith(WEBHOOK_PREFIX)) {
      return `Webhook URL must start with ${WEBHOOK_PREFIX}`;
    }
    return null;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const err = validateWebhookUrlField();
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      const res = await saveSettings({
        discord_webhook_url: webhookUrl.trim(),
        discord_username: username.trim(),
      });
      applyResponse(res);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (testing) return;
    const err = validateWebhookUrlField();
    if (err) {
      toast.error(err);
      return;
    }
    setTesting(true);
    try {
      const result = await testNotification({
        webhook_url: webhookUrl.trim(),
        username: username.trim(),
      });
      if (result.ok) {
        toast.success("Test notification sent");
      } else {
        toast.error(
          `Test failed${result.error ? `: ${result.error}` : result.status ? ` (${result.status})` : ""}`,
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <p className="font-mono text-xs text-muted-foreground">Loading settings…</p>
    );
  }

  if (loadError) {
    return (
      <p className="font-mono text-xs" style={{ color: "var(--color-status-error)" }}>
        {loadError}
      </p>
    );
  }

  const showingEnvFallback = webhookUrl.trim() === "" && envFallback;

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-medium text-foreground">Discord</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Where stock alerts are delivered. Get a webhook URL from Discord:
            Channel Settings → Integrations → Webhooks → New.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="webhook-url">Webhook URL</Label>
          <Input
            id="webhook-url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder={`${WEBHOOK_PREFIX}…`}
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
            disabled={saving}
          />
          {showingEnvFallback ? (
            <p className="font-mono text-[11px] text-muted-foreground">
              Empty → falling back to <code>DISCORD_WEBHOOK_URL</code> env var.
            </p>
          ) : (
            <p className="font-mono text-[11px] text-muted-foreground">
              Leave empty to fall back to the <code>DISCORD_WEBHOOK_URL</code> env var.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="username">Bot username</Label>
          <Input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Inventory Monitor"
            maxLength={80}
            disabled={saving}
          />
          <p className="font-mono text-[11px] text-muted-foreground">
            Display name on the Discord embed. Empty → &ldquo;Inventory Monitor&rdquo;.
          </p>
        </div>
      </section>

      <Separator />

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleTest}
          disabled={testing}
        >
          {testing ? "Testing…" : "Send test notification"}
        </Button>
        <Link
          href="/"
          className={`${buttonVariants({ variant: "ghost", size: "sm" })} ml-auto`}
        >
          Back to dashboard
        </Link>
      </div>
    </form>
  );
}
