/**
 * State-machine tests for applyCheckResult (SPEC §7, §16).
 *
 * Uses an in-memory SQLite database (via makeTestDb) so each test is isolated
 * and no files are touched.  Webhook calls are suppressed via suppressWebhook:true
 * or by inspecting the returned outcome.notification field.
 */
import { describe, test, expect, beforeEach, vi, afterEach } from "vitest";
import { applyCheckResult } from "./checker";
import { makeTestDb } from "./test-db";
import { items, stockEvents } from "./db/schema";
import { eq } from "drizzle-orm";
import type { Item } from "./db/schema";
import type { ProductResult } from "./bestbuy";

type TestDb = ReturnType<typeof makeTestDb>["db"];

const NOW = 1_700_000_000_000;

const baseItemValues = {
  sku: "6587182",
  name: "Acer Chromebook 311",
  brand: "Acer",
  imageUrl: "https://pisces.bbystatic.com/image2/BestBuy_US/images/products/6587/6587182_sd.jpg",
  productUrl: "https://www.bestbuy.com/site/-/6587182.p",
  currentPriceCents: null as number | null,
  regularPriceCents: null as number | null,
  checkIntervalMin: 1,
  restockNotifyIntervalMin: 10,
  stockAlertEnabled: 1,
  stockNotifyMode: "repeat",
  enabled: 1,
  note: null as string | null,
  lastStockStatus: "UNKNOWN",
  lastButtonState: null as string | null,
  healthStatus: "OK",
  lastHealthMessage: null as string | null,
  consecutiveErrors: 0,
  lastCheckedAt: null as number | null,
  lastInStockAt: null as number | null,
  lastNotifiedAt: null as number | null,
  nextCheckDueAt: null as number | null,
  priceAlertEnabled: 1,
  targetPriceCents: null as number | null,
  priceNotifyIntervalMin: 60,
  priceNotifyMode: "repeat",
  lastPriceNotifiedAt: null as number | null,
  priceAlertWhileOos: 1,
  pendingHitPriceCents: null as number | null,
  pendingHitSeenCount: 0,
  createdAt: NOW - 3600_000,
  updatedAt: NOW - 3600_000,
};

const okResult = (overrides: Partial<Extract<ProductResult, { ok: true }>> = {}): ProductResult => ({
  ok: true,
  sku: "6587182",
  name: "Acer Chromebook 311",
  brand: "Acer",
  currentPriceCents: 15900,
  buttonState: "ADD_TO_CART",
  purchasable: true,
  canonicalUrl: "https://www.bestbuy.com/site/-/6587182.p",
  ...overrides,
});

const errResult = (error = "HTTP 403"): ProductResult => ({
  ok: false,
  sku: "6587182",
  error,
});

async function insertItem(
  db: TestDb,
  overrides: Record<string, unknown> = {},
): Promise<number> {
  const row = await db
    .insert(items)
    .values({ ...baseItemValues, ...overrides })
    .returning({ id: items.id })
    .get();
  return (row as { id: number }).id;
}

function getItem(db: TestDb, id: number): Item {
  return db.select().from(items).where(eq(items.id, id)).get() as Item;
}

function getEvents(db: TestDb, itemId: number) {
  return db.select().from(stockEvents).where(eq(stockEvents.itemId, itemId)).all();
}

let db: TestDb;

beforeEach(() => {
  db = makeTestDb().db;
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, { status: 204 }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Stock state machine
// ---------------------------------------------------------------------------

describe("UNKNOWN → IN_STOCK", () => {
  test("fires alert and sets lastStockStatus=IN_STOCK", async () => {
    const id = await insertItem(db, { lastStockStatus: "UNKNOWN" });
    const outcome = await applyCheckResult(id, okResult(), {
      db,
      now: NOW,
      webhookUrl: "https://discord.com/test",
    });
    expect(outcome.notification).toBe("alert");
    expect(outcome.transitioned).toBe(true);
    const item = getItem(db, id);
    expect(item.lastStockStatus).toBe("IN_STOCK");
    expect(item.lastNotifiedAt).toBe(NOW);
  });

  test("does NOT fire when stock alerts are disabled", async () => {
    const id = await insertItem(db, {
      lastStockStatus: "UNKNOWN",
      stockAlertEnabled: 0,
    });
    const outcome = await applyCheckResult(id, okResult(), {
      db,
      now: NOW,
      suppressWebhook: true,
    });
    expect(outcome.notification).toBeNull();
    const item = getItem(db, id);
    expect(item.lastStockStatus).toBe("IN_STOCK");
    expect(item.lastNotifiedAt).toBeNull();
  });
});

describe("UNKNOWN → OUT_OF_STOCK", () => {
  test("no alert fired, stock status set", async () => {
    const id = await insertItem(db, { lastStockStatus: "UNKNOWN" });
    const outcome = await applyCheckResult(
      id,
      okResult({ buttonState: "SOLD_OUT", purchasable: false }),
      { db, now: NOW, suppressWebhook: true },
    );
    expect(outcome.notification).toBeNull();
    expect(outcome.transitioned).toBe(true);
    expect(getItem(db, id).lastStockStatus).toBe("OUT_OF_STOCK");
  });
});

describe("OUT_OF_STOCK → IN_STOCK", () => {
  test("fires restock alert", async () => {
    const id = await insertItem(db, { lastStockStatus: "OUT_OF_STOCK" });
    const outcome = await applyCheckResult(id, okResult(), {
      db,
      now: NOW,
      suppressWebhook: true,
    });
    expect(outcome.notification).toBe("alert");
    expect(outcome.transitioned).toBe(true);
    expect(getItem(db, id).lastStockStatus).toBe("IN_STOCK");
  });

  test("writes a transition stock_event row", async () => {
    const id = await insertItem(db, { lastStockStatus: "OUT_OF_STOCK" });
    await applyCheckResult(id, okResult(), {
      db,
      now: NOW,
      suppressWebhook: true,
    });
    const events = getEvents(db, id).filter((e) => e.status === "IN_STOCK");
    expect(events).toHaveLength(1);
    expect(events[0].buttonState).toBe("ADD_TO_CART");
  });
});

describe("IN_STOCK → IN_STOCK (reminder logic)", () => {
  test("within reminder window → no notification", async () => {
    const id = await insertItem(db, {
      lastStockStatus: "IN_STOCK",
      lastNotifiedAt: NOW - 5 * 60_000, // 5min ago, window=10min
      restockNotifyIntervalMin: 10,
    });
    const outcome = await applyCheckResult(id, okResult(), {
      db,
      now: NOW,
      suppressWebhook: true,
    });
    expect(outcome.notification).toBeNull();
    expect(outcome.transitioned).toBe(false);
  });

  test("past reminder window → fires reminder", async () => {
    const id = await insertItem(db, {
      lastStockStatus: "IN_STOCK",
      lastNotifiedAt: NOW - 15 * 60_000, // 15min ago, window=10min
      restockNotifyIntervalMin: 10,
    });
    const outcome = await applyCheckResult(id, okResult(), {
      db,
      now: NOW,
      suppressWebhook: true,
    });
    expect(outcome.notification).toBe("reminder");
  });

  test("once mode — lastNotifiedAt set → no reminder even past window", async () => {
    const id = await insertItem(db, {
      lastStockStatus: "IN_STOCK",
      lastNotifiedAt: NOW - 20 * 60_000,
      restockNotifyIntervalMin: 10,
      stockNotifyMode: "once",
    });
    const outcome = await applyCheckResult(id, okResult(), {
      db,
      now: NOW,
      suppressWebhook: true,
    });
    expect(outcome.notification).toBeNull();
  });

  test("restart with IN_STOCK + lastNotifiedAt set — no duplicate first alert", async () => {
    const id = await insertItem(db, {
      lastStockStatus: "IN_STOCK",
      lastNotifiedAt: NOW - 5 * 60_000, // recently notified
      restockNotifyIntervalMin: 10,
    });
    const outcome = await applyCheckResult(id, okResult(), {
      db,
      now: NOW,
      suppressWebhook: true,
    });
    expect(outcome.notification).toBeNull();
  });
});

describe("IN_STOCK → OUT_OF_STOCK", () => {
  test("fires stock-change alert and records lastNotifiedAt", async () => {
    const id = await insertItem(db, {
      lastStockStatus: "IN_STOCK",
      lastNotifiedAt: NOW - 60_000,
    });
    const outcome = await applyCheckResult(
      id,
      okResult({ buttonState: "SOLD_OUT", purchasable: false }),
      { db, now: NOW, suppressWebhook: true },
    );
    expect(outcome.notification).toBe("out_of_stock");
    expect(getItem(db, id).lastNotifiedAt).toBe(NOW);
    expect(getItem(db, id).lastStockStatus).toBe("OUT_OF_STOCK");
  });
});

describe("error handling", () => {
  test("error does not change stock state (consecutiveErrors < 5)", async () => {
    const id = await insertItem(db, {
      lastStockStatus: "IN_STOCK",
      consecutiveErrors: 0,
    });
    const outcome = await applyCheckResult(id, errResult(), {
      db,
      now: NOW,
      suppressWebhook: true,
    });
    expect(outcome.notification).toBeNull();
    const item = getItem(db, id);
    expect(item.lastStockStatus).toBe("IN_STOCK"); // unchanged
    expect(item.consecutiveErrors).toBe(1);
    expect(item.healthStatus).toBe("OK"); // not degraded yet at 1 error
  });

  test("error at 5 consecutive invalidates stock to UNKNOWN", async () => {
    const id = await insertItem(db, {
      lastStockStatus: "IN_STOCK",
      consecutiveErrors: 4,
    });
    await applyCheckResult(id, errResult(), { db, now: NOW, suppressWebhook: true });
    const item = getItem(db, id);
    expect(item.lastStockStatus).toBe("UNKNOWN");
    expect(item.healthStatus).toBe("ERROR");
  });
});

// ---------------------------------------------------------------------------
// Combined stock + price notification
// ---------------------------------------------------------------------------

describe("combined stock + price alert", () => {
  test("OOS → IN_STOCK while target price hit → fires combined (not two separate)", async () => {
    const id = await insertItem(db, {
      lastStockStatus: "OUT_OF_STOCK",
      priceAlertEnabled: 1,
      targetPriceCents: 20000,
      // stale-price guard: need 2 same hits; pre-seed one observation
      pendingHitPriceCents: 15900,
      pendingHitSeenCount: 1,
    });
    const outcome = await applyCheckResult(id, okResult(), {
      db,
      now: NOW,
      suppressWebhook: true,
    });
    // Should be "combined" (one webhook), not two separate firings
    expect(outcome.notification).toBe("combined");
    expect(outcome.transitioned).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Price alert: stale-price guard
// ---------------------------------------------------------------------------

describe("stale-price guard", () => {
  test("first observation records pending but does not fire", async () => {
    const id = await insertItem(db, {
      priceAlertEnabled: 1,
      targetPriceCents: 20000,
      currentPriceCents: 20000,
      lastStockStatus: "IN_STOCK",
      // Within reminder window so the stock alert doesn't fire a reminder.
      lastNotifiedAt: NOW - 5 * 60_000, // 5min ago, window=10min
    });
    const outcome = await applyCheckResult(
      id,
      okResult({ currentPriceCents: 15900 }),
      { db, now: NOW, suppressWebhook: true },
    );
    expect(outcome.notification).toBeNull();
    expect(getItem(db, id).pendingHitPriceCents).toBe(15900);
    expect(getItem(db, id).pendingHitSeenCount).toBe(1);
  });

  test("second same-price observation fires", async () => {
    const id = await insertItem(db, {
      priceAlertEnabled: 1,
      targetPriceCents: 20000,
      currentPriceCents: 20000,
      lastStockStatus: "IN_STOCK",
      pendingHitPriceCents: 15900,
      pendingHitSeenCount: 1,
      // Within reminder window so only the price drop fires (not combined).
      lastNotifiedAt: NOW - 5 * 60_000,
    });
    const outcome = await applyCheckResult(
      id,
      okResult({ currentPriceCents: 15900 }),
      { db, now: NOW, suppressWebhook: true },
    );
    expect(outcome.notification).toBe("price_drop");
    const item = getItem(db, id);
    expect(item.pendingHitPriceCents).toBeNull();
    expect(item.pendingHitSeenCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// SPEC §6.8 — J-code fulfillment fallback (Layer 1.5)
// ---------------------------------------------------------------------------

describe("PENDING_REINDEX → OK via fulfillment-stitched ProductResult", () => {
  test("exits PENDING_REINDEX, fires stock alert, keeps stitched name/price untouched", async () => {
    const id = await insertItem(db, {
      lastStockStatus: "UNKNOWN",
      healthStatus: "PENDING_REINDEX",
      lastHealthMessage: "Best Buy's price API doesn't recognize this SKU…",
      // Last-known values captured by Add-Item lookup; the Layer 1.5 path
      // must pass these straight through unchanged.
      name: "Lenovo IdeaPad",
      brand: "Lenovo",
      currentPriceCents: 59999,
      regularPriceCents: 69999,
      productUrl: "https://www.bestbuy.com/site/-/6674708.p?skuId=6674708",
    });

    // Shape of a ProductResult that Layer 1.5 produces: stock signal from
    // fulfillment, everything else stitched from the existing item row.
    const stitched: ProductResult = {
      ok: true,
      sku: "6587182",
      name: "Lenovo IdeaPad",
      brand: "Lenovo",
      currentPriceCents: 59999,
      regularPriceCents: 69999,
      buttonState: "ADD_TO_CART",
      purchasable: true,
      canonicalUrl: "https://www.bestbuy.com/site/-/6674708.p?skuId=6674708",
    };

    const outcome = await applyCheckResult(id, stitched, {
      db,
      now: NOW,
      webhookUrl: "https://discord.com/test",
    });

    expect(outcome.notification).toBe("alert");
    expect(outcome.transitioned).toBe(true);

    const item = getItem(db, id);
    expect(item.healthStatus).toBe("OK");
    expect(item.lastStockStatus).toBe("IN_STOCK");
    expect(item.lastButtonState).toBe("ADD_TO_CART");
    // Stitched fields preserved (no clobbering).
    expect(item.name).toBe("Lenovo IdeaPad");
    expect(item.brand).toBe("Lenovo");
    expect(item.currentPriceCents).toBe(59999);
    expect(item.regularPriceCents).toBe(69999);
  });
});
