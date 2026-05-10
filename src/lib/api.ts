/**
 * Tiny fetch wrappers for the dashboard. No React Query / SWR — we want
 * minimum surface area and explicit polling.
 */

import type { Item, StockEvent } from "@/lib/db/schema";

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      // not JSON — leave body null
    }
  }
  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : null) ?? `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body as T;
}

export type HealthResponse = {
  status: "ok" | "degraded";
  worker_last_tick_age_ms: number | null;
  items_checked_last: number | null;
  last_tick_at: number | null;
};

export async function fetchItems(signal?: AbortSignal): Promise<Item[]> {
  const res = await fetch("/api/items", { signal, cache: "no-store" });
  return jsonOrThrow<Item[]>(res);
}

export async function fetchHealth(
  signal?: AbortSignal,
): Promise<HealthResponse> {
  const res = await fetch("/api/health", { signal, cache: "no-store" });
  // health intentionally returns 503 when stale; treat that as a normal body
  const text = await res.text();
  if (!text) {
    throw new Error(`Health responded ${res.status} with empty body`);
  }
  return JSON.parse(text) as HealthResponse;
}

export type CreateItemInput = {
  input: string;
  check_interval_min?: number;
  restock_notify_interval_min?: number;
  note?: string;
};

export async function createItem(input: CreateItemInput): Promise<Item> {
  const res = await fetch("/api/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return jsonOrThrow<Item>(res);
}

export type ProductLookup = {
  sku: string;
  name: string;
  brand: string | null;
  image_url: string;
  product_url: string;
  current_price_cents: number;
  regular_price_cents: number | null;
  button_state: string;
  purchasable: boolean;
};

export async function lookupProduct(
  input: string,
  signal?: AbortSignal,
): Promise<ProductLookup> {
  const res = await fetch("/api/products/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input }),
    signal,
  });
  return jsonOrThrow<ProductLookup>(res);
}

export type PatchItemInput = {
  check_interval_min?: number;
  restock_notify_interval_min?: number;
  enabled?: boolean;
  note?: string | null;
};

export async function patchItem(
  id: number,
  input: PatchItemInput,
): Promise<Item> {
  const res = await fetch(`/api/items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return jsonOrThrow<Item>(res);
}

export async function deleteItem(id: number): Promise<void> {
  const res = await fetch(`/api/items/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const text = await res.text();
    let message = `Delete failed (${res.status})`;
    try {
      const body = JSON.parse(text) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
}

export async function checkNow(
  id: number,
): Promise<{ outcome: string; item: Item }> {
  const res = await fetch(`/api/items/${id}/check-now`, { method: "POST" });
  return jsonOrThrow<{ outcome: string; item: Item }>(res);
}

export async function fetchEvents(
  id: number,
  limit = 50,
): Promise<StockEvent[]> {
  const res = await fetch(`/api/items/${id}/events?limit=${limit}`, {
    cache: "no-store",
  });
  return jsonOrThrow<StockEvent[]>(res);
}

export async function testNotification(input?: {
  webhook_url?: string;
  username?: string;
}): Promise<{
  ok: boolean;
  status?: number;
  error?: string;
}> {
  const res = await fetch("/api/test-notification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {}),
  });
  const text = await res.text();
  if (!text) {
    return { ok: res.ok, status: res.status };
  }
  return JSON.parse(text) as {
    ok: boolean;
    status?: number;
    error?: string;
  };
}

export type SettingsResponse = {
  stored: {
    discord_webhook_url: string;
    discord_username: string;
  };
  resolved: {
    discord_webhook_url: string;
    discord_username: string;
  };
  env_webhook_url_present: boolean;
};

export type SettingsPatch = {
  discord_webhook_url?: string;
  discord_username?: string;
};

export async function fetchSettings(): Promise<SettingsResponse> {
  const res = await fetch("/api/settings", { cache: "no-store" });
  return jsonOrThrow<SettingsResponse>(res);
}

export async function saveSettings(patch: SettingsPatch): Promise<SettingsResponse> {
  const res = await fetch("/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return jsonOrThrow<SettingsResponse>(res);
}
