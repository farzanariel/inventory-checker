/**
 * Concurrency test (SPEC §16): two simultaneous applyCheckResult calls on the
 * same item produce exactly one alert, not two.
 *
 * SQLite BEGIN IMMEDIATE serializes the writes; the second caller re-reads the
 * updated row inside its own transaction so the second call sees the first
 * call's committed state and does not fire a duplicate.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { applyCheckResult } from "./checker";
import { makeTestDb } from "./test-db";
import { items } from "./db/schema";
import type { ProductResult } from "./bestbuy";

const NOW = 1_700_000_000_000;

const baseItem = {
  sku: "9999901",
  name: "Concurrency Test Product",
  brand: null as string | null,
  imageUrl: null as string | null,
  productUrl: "https://www.bestbuy.com/site/-/9999901.p",
  currentPriceCents: null as number | null,
  regularPriceCents: null as number | null,
  checkIntervalMin: 1,
  restockNotifyIntervalMin: 10,
  stockAlertEnabled: 1,
  stockNotifyMode: "repeat",
  enabled: 1,
  note: null as string | null,
  lastStockStatus: "OUT_OF_STOCK",
  lastButtonState: null as string | null,
  healthStatus: "OK",
  lastHealthMessage: null as string | null,
  consecutiveErrors: 0,
  lastCheckedAt: null as number | null,
  lastInStockAt: null as number | null,
  lastNotifiedAt: null as number | null,
  nextCheckDueAt: null as number | null,
  priceAlertEnabled: 0,
  targetPriceCents: null as number | null,
  priceNotifyIntervalMin: 60,
  priceNotifyMode: "repeat",
  lastPriceNotifiedAt: null as number | null,
  priceAlertWhileOos: 1,
  pendingHitPriceCents: null as number | null,
  pendingHitSeenCount: 0,
  createdAt: NOW - 3600_000,
  updatedAt: NOW - 3600_000,
} as const;

const inStockResult: ProductResult = {
  ok: true,
  sku: "9999901",
  name: "Concurrency Test Product",
  currentPriceCents: 9999,
  buttonState: "ADD_TO_CART",
  purchasable: true,
  canonicalUrl: "https://www.bestbuy.com/site/-/9999901.p",
};

let db: ReturnType<typeof makeTestDb>["db"];
let notifyCount = 0;

beforeEach(() => {
  ({ db } = makeTestDb());
  notifyCount = 0;

  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    notifyCount++;
    return new Response(null, { status: 204 });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("concurrent applyCheckResult calls", () => {
  test("two simultaneous calls produce exactly one webhook fire", async () => {
    const row = await db
      .insert(items)
      .values(baseItem)
      .returning({ id: items.id })
      .get();
    const id = (row as { id: number }).id;

    const webhookUrl = "https://discord.com/api/webhooks/test/token";

    const [o1, o2] = await Promise.all([
      applyCheckResult(id, inStockResult, { db, now: NOW, webhookUrl }),
      applyCheckResult(id, inStockResult, { db, now: NOW, webhookUrl }),
    ]);

    // Exactly one of the two calls should have sent a notification.
    const notifications = [o1.notification, o2.notification].filter(Boolean);
    expect(notifications).toHaveLength(1);

    // Exactly one HTTP call to Discord.
    expect(notifyCount).toBe(1);
  });
});
