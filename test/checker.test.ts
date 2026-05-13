/**
 * Tests for src/lib/checker.ts — the shared transactional check pipeline.
 *
 * Each test uses a fresh in-memory SQLite database to ensure isolation.
 * `:memory:` doesn't support WAL, so we use journal_mode=MEMORY plus the
 * same busy_timeout/foreign_keys pragmas as production.
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import { applyCheckResult, computeNextCheckDueAt } from "@/lib/checker";
import type { ProductResult } from "@/lib/bestbuy";
import type { Item } from "@/lib/db/schema";

type TestDb = ReturnType<typeof makeTestDb>["db"];

function makeTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = MEMORY");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return { db, sqlite };
}

function insertItem(
  db: TestDb,
  overrides: Partial<typeof schema.items.$inferInsert> = {},
): Item {
  const now = Date.now();
  const base: typeof schema.items.$inferInsert = {
    sku: "6587182",
    productUrl: "https://www.bestbuy.com/site/-/6587182.p?skuId=6587182",
    checkIntervalMin: 1,
    restockNotifyIntervalMin: 10,
    enabled: 1,
    lastStockStatus: "UNKNOWN",
    healthStatus: "OK",
    consecutiveErrors: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  db.insert(schema.items).values(base).run();
  const sku = base.sku as string;
  return db.select().from(schema.items).where(eq(schema.items.sku, sku)).get() as Item;
}

function okResult(overrides: Partial<Extract<ProductResult, { ok: true }>> = {}): ProductResult {
  return {
    ok: true,
    sku: "6587182",
    name: "Acer Chromebook 311",
    brand: "Acer",
    currentPriceCents: 15999,
    regularPriceCents: 19999,
    buttonState: "ADD_TO_CART",
    purchasable: true,
    canonicalUrl: "https://www.bestbuy.com/site/acer/6587182.p?skuId=6587182",
    ...overrides,
  };
}

function countEvents(db: TestDb, itemId: number): number {
  return db.select().from(schema.stockEvents).where(eq(schema.stockEvents.itemId, itemId)).all().length;
}

function getEvents(db: TestDb, itemId: number) {
  return db.select().from(schema.stockEvents).where(eq(schema.stockEvents.itemId, itemId)).all();
}

function reread(db: TestDb, id: number): Item {
  return db.select().from(schema.items).where(eq(schema.items.id, id)).get() as Item;
}

const WEBHOOK = "https://example.test/webhook";

describe("computeNextCheckDueAt", () => {
  it("returns now + interval*60_000 ± 10% across 100 samples", () => {
    const now = 1_000_000_000_000;
    const intervalMin = 1;
    const min = now + 0.9 * intervalMin * 60_000;
    const max = now + 1.1 * intervalMin * 60_000;
    for (let i = 0; i < 100; i++) {
      const next = computeNextCheckDueAt(now, intervalMin);
      expect(next).toBeGreaterThanOrEqual(min);
      expect(next).toBeLessThanOrEqual(max);
    }
  });
});

describe("applyCheckResult — transitions and notifications", () => {
  let env: ReturnType<typeof makeTestDb>;

  beforeEach(() => {
    env = makeTestDb();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    env.sqlite.close();
    vi.restoreAllMocks();
  });

  it("UNKNOWN -> IN_STOCK fires alert and inserts transition + NOTIFIED rows", async () => {
    const item = insertItem(env.db);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    const outcome = await applyCheckResult(item.id, okResult(), {
      db: env.db,
      webhookUrl: WEBHOOK,
    });

    expect(outcome.notification).toBe("alert");
    expect(outcome.transitioned).toBe(true);
    expect(outcome.webhookOk).toBe(true);

    const after = reread(env.db, item.id);
    expect(after.lastStockStatus).toBe("IN_STOCK");
    expect(after.lastNotifiedAt).not.toBeNull();
    expect(after.lastInStockAt).not.toBeNull();
    expect(after.healthStatus).toBe("OK");
    expect(after.consecutiveErrors).toBe(0);

    const events = getEvents(env.db, item.id);
    expect(events).toHaveLength(2);
    const transition = events.find((e) => e.status === "IN_STOCK");
    expect(transition).toBeDefined();
    expect(transition?.buttonState).toBe("ADD_TO_CART");
    const notified = events.find((e) => e.status === "NOTIFIED");
    expect(notified).toBeDefined();
    expect(notified?.message).toBe("alert");
  });

  it("OUT_OF_STOCK -> IN_STOCK fires alert", async () => {
    const item = insertItem(env.db, {
      lastStockStatus: "OUT_OF_STOCK",
      lastButtonState: "SOLD_OUT",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    const outcome = await applyCheckResult(item.id, okResult(), {
      db: env.db,
      webhookUrl: WEBHOOK,
    });

    expect(outcome.notification).toBe("alert");
    expect(outcome.transitioned).toBe(true);
    expect(reread(env.db, item.id).lastStockStatus).toBe("IN_STOCK");

    const events = getEvents(env.db, item.id);
    expect(events.filter((e) => e.status === "IN_STOCK")).toHaveLength(1);
    expect(events.filter((e) => e.status === "NOTIFIED")).toHaveLength(1);
  });

  it("IN_STOCK -> IN_STOCK within reminder window: no notification, no events", async () => {
    const now = Date.now();
    const item = insertItem(env.db, {
      lastStockStatus: "IN_STOCK",
      lastButtonState: "ADD_TO_CART",
      lastNotifiedAt: now - 60_000, // 1 minute ago
      restockNotifyIntervalMin: 10, // 10 minute window
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const outcome = await applyCheckResult(item.id, okResult(), {
      db: env.db,
      now,
      webhookUrl: WEBHOOK,
    });

    expect(outcome.notification).toBeNull();
    expect(outcome.transitioned).toBe(false);
    expect(outcome.webhookOk).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();

    const events = getEvents(env.db, item.id);
    expect(events).toHaveLength(0);
  });

  it("IN_STOCK -> IN_STOCK past reminder window: reminder fires", async () => {
    const now = Date.now();
    const item = insertItem(env.db, {
      lastStockStatus: "IN_STOCK",
      lastButtonState: "ADD_TO_CART",
      lastNotifiedAt: now - 11 * 60_000, // 11 minutes ago
      restockNotifyIntervalMin: 10,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    const outcome = await applyCheckResult(item.id, okResult(), {
      db: env.db,
      now,
      webhookUrl: WEBHOOK,
    });

    expect(outcome.notification).toBe("reminder");
    expect(outcome.transitioned).toBe(false);
    expect(outcome.webhookOk).toBe(true);

    const after = reread(env.db, item.id);
    expect(after.lastStockStatus).toBe("IN_STOCK");
    expect(after.lastNotifiedAt).toBe(now);

    const events = getEvents(env.db, item.id);
    expect(events).toHaveLength(1); // only NOTIFIED, no transition
    expect(events[0]?.status).toBe("NOTIFIED");
    expect(events[0]?.message).toBe("reminder");
  });

  it("IN_STOCK -> OUT_OF_STOCK: state changes, last_notified_at reset to null, no notification", async () => {
    const now = Date.now();
    const item = insertItem(env.db, {
      lastStockStatus: "IN_STOCK",
      lastButtonState: "ADD_TO_CART",
      lastNotifiedAt: now - 60_000,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    const outcome = await applyCheckResult(
      item.id,
      okResult({ buttonState: "SOLD_OUT" }),
      { db: env.db, now, webhookUrl: WEBHOOK },
    );

    expect(outcome.notification).toBeNull();
    expect(outcome.transitioned).toBe(true);

    const after = reread(env.db, item.id);
    expect(after.lastStockStatus).toBe("OUT_OF_STOCK");
    expect(after.lastNotifiedAt).toBeNull();

    const events = getEvents(env.db, item.id);
    expect(events).toHaveLength(1);
    expect(events[0]?.status).toBe("OUT_OF_STOCK");
    expect(events.filter((e) => e.status === "NOTIFIED")).toHaveLength(0);
  });

  it("OUT_OF_STOCK -> OUT_OF_STOCK: no transition, no events", async () => {
    const item = insertItem(env.db, {
      lastStockStatus: "OUT_OF_STOCK",
      lastButtonState: "SOLD_OUT",
    });
    const beforeCount = countEvents(env.db, item.id);
    vi.stubGlobal("fetch", vi.fn());

    const outcome = await applyCheckResult(
      item.id,
      okResult({ buttonState: "SOLD_OUT" }),
      { db: env.db, webhookUrl: WEBHOOK },
    );

    expect(outcome.notification).toBeNull();
    expect(outcome.transitioned).toBe(false);
    expect(countEvents(env.db, item.id)).toBe(beforeCount);

    const after = reread(env.db, item.id);
    expect(after.lastStockStatus).toBe("OUT_OF_STOCK");
  });

  it("Result.ok=false (HTTP error): consecutive_errors increments, stock_status unchanged, ERROR event inserted", async () => {
    const item = insertItem(env.db, {
      lastStockStatus: "OUT_OF_STOCK",
      lastButtonState: "SOLD_OUT",
    });
    vi.stubGlobal("fetch", vi.fn());

    const outcome = await applyCheckResult(
      item.id,
      { ok: false, sku: "6587182", error: "HTTP 500" },
      { db: env.db, webhookUrl: WEBHOOK },
    );

    expect(outcome.notification).toBeNull();
    expect(outcome.transitioned).toBe(false);

    const after = reread(env.db, item.id);
    expect(after.consecutiveErrors).toBe(1);
    expect(after.lastStockStatus).toBe("OUT_OF_STOCK"); // unchanged
    expect(after.lastHealthMessage).toBe("HTTP 500");

    const events = getEvents(env.db, item.id);
    expect(events).toHaveLength(1);
    expect(events[0]?.status).toBe("ERROR");
    expect(events[0]?.message).toBe("HTTP 500");
  });

  it("3 consecutive errors -> DEGRADED, 5 -> ERROR, then success -> OK + counter reset", async () => {
    const item = insertItem(env.db);
    vi.stubGlobal("fetch", vi.fn());

    // 3 errors
    for (let i = 0; i < 3; i++) {
      await applyCheckResult(
        item.id,
        { ok: false, sku: "6587182", error: "boom" },
        { db: env.db, webhookUrl: WEBHOOK },
      );
    }
    let after = reread(env.db, item.id);
    expect(after.consecutiveErrors).toBe(3);
    expect(after.healthStatus).toBe("DEGRADED");

    // 2 more (total 5)
    await applyCheckResult(
      item.id,
      { ok: false, sku: "6587182", error: "boom" },
      { db: env.db, webhookUrl: WEBHOOK },
    );
    await applyCheckResult(
      item.id,
      { ok: false, sku: "6587182", error: "boom" },
      { db: env.db, webhookUrl: WEBHOOK },
    );
    after = reread(env.db, item.id);
    expect(after.consecutiveErrors).toBe(5);
    expect(after.healthStatus).toBe("ERROR");

    // success (we want to verify counter reset & healthStatus -> OK; suppress webhook to avoid network)
    await applyCheckResult(item.id, okResult(), {
      db: env.db,
      webhookUrl: WEBHOOK,
      suppressWebhook: true,
    });
    after = reread(env.db, item.id);
    expect(after.consecutiveErrors).toBe(0);
    expect(after.healthStatus).toBe("OK");
    expect(after.lastHealthMessage).toBeNull();
  });

  it("CHECK_STORES maps to OUT_OF_STOCK on UNKNOWN -> OUT_OF_STOCK with no alert (SKU 6587182's actual state)", async () => {
    const item = insertItem(env.db);
    vi.stubGlobal("fetch", vi.fn());

    const outcome = await applyCheckResult(
      item.id,
      okResult({ buttonState: "CHECK_STORES" }),
      { db: env.db, webhookUrl: WEBHOOK },
    );

    expect(outcome.notification).toBeNull();
    expect(outcome.transitioned).toBe(true);

    const after = reread(env.db, item.id);
    expect(after.lastStockStatus).toBe("OUT_OF_STOCK");
    expect(after.lastButtonState).toBe("CHECK_STORES");

    const events = getEvents(env.db, item.id);
    expect(events).toHaveLength(1);
    expect(events[0]?.status).toBe("OUT_OF_STOCK");
    expect(events.filter((e) => e.status === "NOTIFIED")).toHaveLength(0);
  });

  it("Restart with state=IN_STOCK + last_notified_at set: never re-fires the initial alert", async () => {
    const now = Date.now();
    const item = insertItem(env.db, {
      lastStockStatus: "IN_STOCK",
      lastButtonState: "ADD_TO_CART",
      lastNotifiedAt: now, // simulates: alert was already fired pre-restart
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    const outcome = await applyCheckResult(item.id, okResult(), {
      db: env.db,
      now,
      webhookUrl: WEBHOOK,
    });

    expect(outcome.notification).not.toBe("alert");
    // Either null (within window) or 'reminder' (past window) — but never 'alert'.
    expect([null, "reminder"]).toContain(outcome.notification);
    // With 600s window and now-now=0 elapsed: should be null.
    expect(outcome.notification).toBeNull();
  });

  it("Concurrency: two simultaneous applyCheckResult calls produce exactly one alert", async () => {
    const item = insertItem(env.db, {
      lastStockStatus: "OUT_OF_STOCK",
      lastButtonState: "SOLD_OUT",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    const [a, b] = await Promise.all([
      applyCheckResult(item.id, okResult(), { db: env.db, webhookUrl: WEBHOOK }),
      applyCheckResult(item.id, okResult(), { db: env.db, webhookUrl: WEBHOOK }),
    ]);

    const alerts = [a.notification, b.notification].filter((n) => n === "alert");
    expect(alerts).toHaveLength(1);

    const transitions = getEvents(env.db, item.id).filter((e) => e.status === "IN_STOCK");
    expect(transitions).toHaveLength(1);
    const notifieds = getEvents(env.db, item.id).filter((e) => e.status === "NOTIFIED");
    expect(notifieds).toHaveLength(1);
  });

  it("suppressWebhook: webhook is not fired but state still updates (webhookOk = null, no NOTIFIED row)", async () => {
    const item = insertItem(env.db);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const outcome = await applyCheckResult(item.id, okResult(), {
      db: env.db,
      webhookUrl: WEBHOOK,
      suppressWebhook: true,
    });

    expect(outcome.notification).toBe("alert");
    expect(outcome.webhookOk).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();

    const after = reread(env.db, item.id);
    expect(after.lastStockStatus).toBe("IN_STOCK");
    expect(after.lastNotifiedAt).not.toBeNull();

    const events = getEvents(env.db, item.id);
    expect(events.filter((e) => e.status === "NOTIFIED")).toHaveLength(0);
    expect(events.filter((e) => e.status === "IN_STOCK")).toHaveLength(1);
  });

  it("Webhook fails: NOTIFIED row marked failed and health_status -> DEGRADED", async () => {
    const item = insertItem(env.db);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
    );

    const outcome = await applyCheckResult(item.id, okResult(), {
      db: env.db,
      webhookUrl: WEBHOOK,
    });

    expect(outcome.notification).toBe("alert");
    expect(outcome.webhookOk).toBe(false);

    const after = reread(env.db, item.id);
    // State transition still committed.
    expect(after.lastStockStatus).toBe("IN_STOCK");
    expect(after.healthStatus).toBe("DEGRADED");
    expect(after.lastHealthMessage).toMatch(/^webhook:/);

    const events = getEvents(env.db, item.id);
    const notified = events.find((e) => e.status === "NOTIFIED");
    expect(notified).toBeDefined();
    expect(notified?.message?.startsWith("failed:")).toBe(true);
  });

  it("Drop mode: no prior price observed → does not fire on first observation", async () => {
    const item = insertItem(env.db, {
      lastStockStatus: "OUT_OF_STOCK",
      targetPriceCents: null,
      currentPriceCents: null,
    });

    const outcome = await applyCheckResult(
      item.id,
      okResult({ buttonState: "SOLD_OUT", currentPriceCents: 5000 }),
      { db: env.db, webhookUrl: WEBHOOK, suppressWebhook: true },
    );

    expect(outcome.notification).toBeNull();
    const after = reread(env.db, item.id);
    expect(after.targetPriceCents).toBeNull();
    expect(after.pendingHitPriceCents).toBeNull();
    expect(after.pendingHitSeenCount).toBe(0);
    expect(after.lastPriceNotifiedAt).toBeNull();
  });

  it("Drop mode: price decreases vs prior → fires after second consecutive sub-anchor observation", async () => {
    const now = Date.now();
    const item = insertItem(env.db, {
      lastStockStatus: "OUT_OF_STOCK",
      targetPriceCents: null,
      currentPriceCents: 10000,
      priceNotifyIntervalMin: 60,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    const first = await applyCheckResult(
      item.id,
      okResult({ buttonState: "SOLD_OUT", currentPriceCents: 9000 }),
      { db: env.db, now, webhookUrl: WEBHOOK },
    );
    expect(first.notification).toBeNull();
    let after = reread(env.db, item.id);
    // Pending stores the pre-drop anchor (10000), not the candidate (9000).
    expect(after.pendingHitPriceCents).toBe(10000);
    expect(after.pendingHitSeenCount).toBe(1);

    const second = await applyCheckResult(
      item.id,
      okResult({ buttonState: "SOLD_OUT", currentPriceCents: 9000 }),
      { db: env.db, now: now + 60_000, webhookUrl: WEBHOOK },
    );
    expect(second.notification).toBe("price_drop");

    after = reread(env.db, item.id);
    expect(after.pendingHitPriceCents).toBeNull();
    expect(after.pendingHitSeenCount).toBe(0);
    expect(after.lastPriceNotifiedAt).toBe(now + 60_000);

    const priceDropEvents = getEvents(env.db, item.id).filter((e) => e.status === "PRICE_DROP");
    expect(priceDropEvents).toHaveLength(1);
    expect(priceDropEvents[0]?.message).toBe("10000 -> 9000");
  });

  it("Drop mode: price increase re-anchors the baseline (no fire on later partial decrease)", async () => {
    const now = Date.now();
    const item = insertItem(env.db, {
      lastStockStatus: "OUT_OF_STOCK",
      targetPriceCents: null,
      currentPriceCents: 10000,
    });

    // Price goes UP from 10000 to 11000 — no fire, baseline tracks up.
    const up = await applyCheckResult(
      item.id,
      okResult({ buttonState: "SOLD_OUT", currentPriceCents: 11000 }),
      { db: env.db, now, webhookUrl: WEBHOOK, suppressWebhook: true },
    );
    expect(up.notification).toBeNull();
    let after = reread(env.db, item.id);
    expect(after.currentPriceCents).toBe(11000);
    expect(after.pendingHitPriceCents).toBeNull();

    // Then price drops to 10500 — that's BELOW current 11000 anchor, so it's a hit.
    const down = await applyCheckResult(
      item.id,
      okResult({ buttonState: "SOLD_OUT", currentPriceCents: 10500 }),
      { db: env.db, now: now + 1000, webhookUrl: WEBHOOK, suppressWebhook: true },
    );
    expect(down.notification).toBeNull(); // first observation, awaiting confirmation
    after = reread(env.db, item.id);
    // Pre-drop anchor was the (now-tracked) 11000 — baseline followed up.
    expect(after.pendingHitPriceCents).toBe(11000);
    expect(after.pendingHitSeenCount).toBe(1);
  });

  it("Drop mode: price stable or rising clears the pending guard", async () => {
    const item = insertItem(env.db, {
      lastStockStatus: "OUT_OF_STOCK",
      targetPriceCents: null,
      currentPriceCents: 10000,
      pendingHitPriceCents: 9000,
      pendingHitSeenCount: 1,
    });

    const outcome = await applyCheckResult(
      item.id,
      okResult({ buttonState: "SOLD_OUT", currentPriceCents: 10000 }),
      { db: env.db, webhookUrl: WEBHOOK, suppressWebhook: true },
    );
    expect(outcome.notification).toBeNull();
    const after = reread(env.db, item.id);
    expect(after.pendingHitPriceCents).toBeNull();
    expect(after.pendingHitSeenCount).toBe(0);
  });

  it("Current above target: pending guard stays cleared, no fire", async () => {
    const item = insertItem(env.db, {
      lastStockStatus: "OUT_OF_STOCK",
      targetPriceCents: 12000,
      pendingHitPriceCents: 11000,
      pendingHitSeenCount: 1,
    });

    const outcome = await applyCheckResult(
      item.id,
      okResult({ buttonState: "SOLD_OUT", currentPriceCents: 15000 }),
      { db: env.db, webhookUrl: WEBHOOK, suppressWebhook: true },
    );

    expect(outcome.notification).toBeNull();
    const after = reread(env.db, item.id);
    expect(after.pendingHitPriceCents).toBeNull();
    expect(after.pendingHitSeenCount).toBe(0);
  });

  it("Target hit requires two consecutive same-price observations before firing", async () => {
    const now = Date.now();
    const item = insertItem(env.db, {
      lastStockStatus: "OUT_OF_STOCK",
      targetPriceCents: 13000,
      priceNotifyIntervalMin: 60,
      pendingHitPriceCents: null,
      pendingHitSeenCount: 0,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    const first = await applyCheckResult(
      item.id,
      okResult({ buttonState: "SOLD_OUT", currentPriceCents: 12500 }),
      { db: env.db, now, webhookUrl: WEBHOOK },
    );
    expect(first.notification).toBeNull();

    let after = reread(env.db, item.id);
    expect(after.pendingHitPriceCents).toBe(12500);
    expect(after.pendingHitSeenCount).toBe(1);
    expect(after.targetPriceCents).toBe(13000);
    expect(after.lastPriceNotifiedAt).toBeNull();

    const second = await applyCheckResult(
      item.id,
      okResult({ buttonState: "SOLD_OUT", currentPriceCents: 12500 }),
      { db: env.db, now: now + 60_000, webhookUrl: WEBHOOK },
    );
    expect(second.notification).toBe("price_drop");

    after = reread(env.db, item.id);
    expect(after.targetPriceCents).toBe(13000); // target itself unchanged
    expect(after.pendingHitPriceCents).toBeNull();
    expect(after.pendingHitSeenCount).toBe(0);
    expect(after.lastPriceNotifiedAt).toBe(now + 60_000);

    const priceDropEvents = getEvents(env.db, item.id).filter((e) => e.status === "PRICE_DROP");
    expect(priceDropEvents).toHaveLength(1);
    expect(priceDropEvents[0]?.message).toBe("13000 -> 12500");
  });

  it("Different hit price resets pending count to 1 for the new candidate", async () => {
    const item = insertItem(env.db, {
      lastStockStatus: "OUT_OF_STOCK",
      targetPriceCents: 13000,
      pendingHitPriceCents: 12500,
      pendingHitSeenCount: 1,
    });

    const outcome = await applyCheckResult(
      item.id,
      okResult({ buttonState: "SOLD_OUT", currentPriceCents: 12000 }),
      { db: env.db, webhookUrl: WEBHOOK, suppressWebhook: true },
    );

    expect(outcome.notification).toBeNull();
    const after = reread(env.db, item.id);
    expect(after.pendingHitPriceCents).toBe(12000);
    expect(after.pendingHitSeenCount).toBe(1);
    expect(after.targetPriceCents).toBe(13000);
  });

  it("Cooldown blocks target-hit fire", async () => {
    const now = Date.now();
    const item = insertItem(env.db, {
      lastStockStatus: "OUT_OF_STOCK",
      targetPriceCents: 13000,
      lastPriceNotifiedAt: now - 10 * 60_000,
      priceNotifyIntervalMin: 60,
    });

    const outcome = await applyCheckResult(
      item.id,
      okResult({ buttonState: "SOLD_OUT", currentPriceCents: 12500 }),
      { db: env.db, now, webhookUrl: WEBHOOK, suppressWebhook: true },
    );

    expect(outcome.notification).toBeNull();
    const after = reread(env.db, item.id);
    expect(after.pendingHitPriceCents).toBe(12500);
    expect(after.pendingHitSeenCount).toBe(1);
    expect(after.lastPriceNotifiedAt).toBe(now - 10 * 60_000); // unchanged
  });

  it("Combined stock+target signal fires a single combined webhook notification", async () => {
    const now = Date.now();
    const item = insertItem(env.db, {
      lastStockStatus: "OUT_OF_STOCK",
      targetPriceCents: 13000,
      pendingHitPriceCents: 12500,
      pendingHitSeenCount: 1,
      lastPriceNotifiedAt: null,
      priceNotifyIntervalMin: 60,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    const outcome = await applyCheckResult(
      item.id,
      okResult({ buttonState: "ADD_TO_CART", currentPriceCents: 12500 }),
      { db: env.db, now, webhookUrl: WEBHOOK },
    );

    expect(outcome.notification).toBe("combined");
    const events = getEvents(env.db, item.id);
    expect(events.filter((e) => e.status === "IN_STOCK")).toHaveLength(1);
    expect(events.filter((e) => e.status === "PRICE_DROP")).toHaveLength(1);
    expect(events.filter((e) => e.status === "NOTIFIED" && e.message === "combined")).toHaveLength(1);
  });

  it("price_alert_while_oos=0 suppresses fire while OOS", async () => {
    const now = Date.now();
    const item = insertItem(env.db, {
      lastStockStatus: "OUT_OF_STOCK",
      targetPriceCents: 13000,
      priceAlertWhileOos: 0,
      pendingHitPriceCents: 12500,
      pendingHitSeenCount: 1,
    });

    const outcome = await applyCheckResult(
      item.id,
      okResult({ buttonState: "SOLD_OUT", currentPriceCents: 12500 }),
      { db: env.db, now, webhookUrl: WEBHOOK, suppressWebhook: true },
    );

    expect(outcome.notification).toBeNull();
    const after = reread(env.db, item.id);
    expect(after.lastPriceNotifiedAt).toBeNull();
  });
});
