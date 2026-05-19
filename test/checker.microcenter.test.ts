/**
 * Tests for applyMicroCenterCheckResult — per-store transactional pipeline (SPEC §21.5).
 *
 * Mirrors the in-memory SQLite harness used by `checker.test.ts`. Each test
 * gets a fresh DB, with all stock events isolated to that test's items.
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import { applyMicroCenterCheckResult } from "@/lib/checker";
import type { Item, ItemStore } from "@/lib/db/schema";
import type { McProductResult } from "@/lib/microcenter";

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

type StoreInit = {
  storeNumber: string;
  storeName: string;
  alertEnabled?: 0 | 1;
  lastStockStatus?: string;
  lastQoh?: number | null;
  lastNotifiedAt?: number | null;
  lastInStockAt?: number | null;
  isOnline?: 0 | 1;
};

function insertMcItem(
  db: TestDb,
  overrides: Partial<typeof schema.items.$inferInsert> = {},
  storeInits: StoreInit[] = [],
): Item {
  const now = Date.now();
  const mcProductId = (overrides.mcProductId as string | undefined) ?? "688173";
  const base: typeof schema.items.$inferInsert = {
    retailer: "microcenter",
    sku: null,
    mcProductId,
    productUrl: `https://www.microcenter.com/product/${mcProductId}/x`,
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
  const item = db
    .select()
    .from(schema.items)
    .where(eq(schema.items.mcProductId, mcProductId))
    .get() as Item;
  for (const s of storeInits) {
    db.insert(schema.itemStores)
      .values({
        itemId: item.id,
        storeNumber: s.storeNumber,
        storeName: s.storeName,
        isOnline: s.isOnline ?? (s.storeNumber === "029" ? 1 : 0),
        alertEnabled: s.alertEnabled ?? 1,
        lastQoh: s.lastQoh ?? null,
        lastStockStatus: s.lastStockStatus ?? "UNKNOWN",
        lastInStockAt: s.lastInStockAt ?? null,
        lastNotifiedAt: s.lastNotifiedAt ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
  return item;
}

function reread(db: TestDb, id: number): Item {
  return db.select().from(schema.items).where(eq(schema.items.id, id)).get() as Item;
}

function rereadStores(db: TestDb, itemId: number): ItemStore[] {
  return db
    .select()
    .from(schema.itemStores)
    .where(eq(schema.itemStores.itemId, itemId))
    .all() as ItemStore[];
}

function getEvents(db: TestDb, itemId: number) {
  return db
    .select()
    .from(schema.stockEvents)
    .where(eq(schema.stockEvents.itemId, itemId))
    .all();
}

function okMc(
  stores: Array<{ storeNumber: string; storeName: string; qoh: number }>,
  overrides: Partial<Extract<McProductResult, { ok: true }>> = {},
): McProductResult {
  return {
    ok: true,
    mcProductId: "688173",
    name: "Test MC Product",
    brand: "TestBrand",
    imageUrl: "https://example.test/img.jpg",
    currentPriceCents: 19999,
    canonicalUrl: "https://www.microcenter.com/product/688173/x",
    stores,
    ...overrides,
  };
}

const WEBHOOK = "https://example.test/webhook";

describe("applyMicroCenterCheckResult — per-store transitions", () => {
  let env: ReturnType<typeof makeTestDb>;

  beforeEach(() => {
    env = makeTestDb();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    env.sqlite.close();
    vi.restoreAllMocks();
  });

  it("UNKNOWN -> IN_STOCK fires per-store alert when alert_enabled=1", async () => {
    const now = Date.now();
    const item = insertMcItem(env.db, {}, [
      { storeNumber: "131", storeName: "Tustin", alertEnabled: 1, lastStockStatus: "UNKNOWN" },
    ]);

    const outcome = await applyMicroCenterCheckResult(
      item.id,
      okMc([{ storeNumber: "131", storeName: "Tustin", qoh: 2 }]),
      { db: env.db, now, webhookUrl: WEBHOOK, suppressWebhook: true },
    );

    expect(outcome.notification).toBe("alert");
    expect(outcome.transitioned).toBe(true);

    const stores = rereadStores(env.db, item.id);
    const tustin = stores.find((s) => s.storeNumber === "131")!;
    expect(tustin.lastStockStatus).toBe("IN_STOCK");
    expect(tustin.lastQoh).toBe(2);
    expect(tustin.lastNotifiedAt).toBe(now);

    expect(reread(env.db, item.id).lastStockStatus).toBe("IN_STOCK");
  });

  it("OUT_OF_STOCK -> IN_STOCK fires alert", async () => {
    const now = Date.now();
    const item = insertMcItem(env.db, {}, [
      { storeNumber: "131", storeName: "Tustin", alertEnabled: 1, lastStockStatus: "OUT_OF_STOCK", lastQoh: 0 },
    ]);

    const outcome = await applyMicroCenterCheckResult(
      item.id,
      okMc([{ storeNumber: "131", storeName: "Tustin", qoh: 1 }]),
      { db: env.db, now, webhookUrl: WEBHOOK, suppressWebhook: true },
    );

    expect(outcome.notification).toBe("alert");
    expect(outcome.transitioned).toBe(true);

    const tustin = rereadStores(env.db, item.id).find((s) => s.storeNumber === "131")!;
    expect(tustin.lastStockStatus).toBe("IN_STOCK");
    expect(tustin.lastQoh).toBe(1);
    expect(tustin.lastNotifiedAt).toBe(now);
  });

  it("alert_enabled=0 suppresses notification on transition", async () => {
    const now = Date.now();
    const item = insertMcItem(env.db, {}, [
      { storeNumber: "131", storeName: "Tustin", alertEnabled: 0, lastStockStatus: "OUT_OF_STOCK", lastQoh: 0 },
    ]);

    const outcome = await applyMicroCenterCheckResult(
      item.id,
      okMc([{ storeNumber: "131", storeName: "Tustin", qoh: 1 }]),
      { db: env.db, now, webhookUrl: WEBHOOK, suppressWebhook: true },
    );

    expect(outcome.notification).toBeNull();

    const tustin = rereadStores(env.db, item.id).find((s) => s.storeNumber === "131")!;
    expect(tustin.lastStockStatus).toBe("IN_STOCK");
    expect(tustin.lastNotifiedAt).toBeNull();
  });

  it("stockAlertEnabled=0 on item suppresses ALL store notifications", async () => {
    const now = Date.now();
    const item = insertMcItem(env.db, { stockAlertEnabled: 0 }, [
      { storeNumber: "131", storeName: "Tustin", alertEnabled: 1, lastStockStatus: "OUT_OF_STOCK", lastQoh: 0 },
      { storeNumber: "065", storeName: "Westmont", alertEnabled: 1, lastStockStatus: "UNKNOWN" },
    ]);

    const outcome = await applyMicroCenterCheckResult(
      item.id,
      okMc([
        { storeNumber: "131", storeName: "Tustin", qoh: 3 },
        { storeNumber: "065", storeName: "Westmont", qoh: 1 },
      ]),
      { db: env.db, now, webhookUrl: WEBHOOK, suppressWebhook: true },
    );

    expect(outcome.notification).toBeNull();

    const stores = rereadStores(env.db, item.id);
    for (const s of stores) {
      expect(s.lastNotifiedAt).toBeNull();
      expect(s.lastStockStatus).toBe("IN_STOCK");
    }
  });

  it("IN_STOCK steady + reminder window elapsed fires reminder", async () => {
    const now = Date.now();
    const item = insertMcItem(env.db, { restockNotifyIntervalMin: 10 }, [
      {
        storeNumber: "131",
        storeName: "Tustin",
        alertEnabled: 1,
        lastStockStatus: "IN_STOCK",
        lastQoh: 1,
        lastNotifiedAt: now - 11 * 60_000,
      },
    ]);

    const outcome = await applyMicroCenterCheckResult(
      item.id,
      okMc([{ storeNumber: "131", storeName: "Tustin", qoh: 1 }]),
      { db: env.db, now, webhookUrl: WEBHOOK, suppressWebhook: true },
    );

    expect(outcome.notification).toBe("reminder");
    expect(outcome.transitioned).toBe(false);

    const tustin = rereadStores(env.db, item.id).find((s) => s.storeNumber === "131")!;
    expect(tustin.lastStockStatus).toBe("IN_STOCK");
    expect(tustin.lastNotifiedAt).toBe(now);
  });

  it("IN_STOCK steady within reminder window fires nothing", async () => {
    const now = Date.now();
    const item = insertMcItem(env.db, { restockNotifyIntervalMin: 10 }, [
      {
        storeNumber: "131",
        storeName: "Tustin",
        alertEnabled: 1,
        lastStockStatus: "IN_STOCK",
        lastQoh: 1,
        lastNotifiedAt: now - 5 * 60_000,
      },
    ]);

    const outcome = await applyMicroCenterCheckResult(
      item.id,
      okMc([{ storeNumber: "131", storeName: "Tustin", qoh: 1 }]),
      { db: env.db, now, webhookUrl: WEBHOOK, suppressWebhook: true },
    );

    expect(outcome.notification).toBeNull();

    const tustin = rereadStores(env.db, item.id).find((s) => s.storeNumber === "131")!;
    expect(tustin.lastNotifiedAt).toBe(now - 5 * 60_000);
  });

  it("stockNotifyMode='once' suppresses reminders but still fires initial alert", async () => {
    const now = Date.now();
    const item = insertMcItem(
      env.db,
      { stockNotifyMode: "once", restockNotifyIntervalMin: 10 },
      [{ storeNumber: "131", storeName: "Tustin", alertEnabled: 1, lastStockStatus: "UNKNOWN" }],
    );

    const first = await applyMicroCenterCheckResult(
      item.id,
      okMc([{ storeNumber: "131", storeName: "Tustin", qoh: 2 }]),
      { db: env.db, now, webhookUrl: WEBHOOK, suppressWebhook: true },
    );
    expect(first.notification).toBe("alert");

    const second = await applyMicroCenterCheckResult(
      item.id,
      okMc([{ storeNumber: "131", storeName: "Tustin", qoh: 2 }]),
      { db: env.db, now: now + 11 * 60_000, webhookUrl: WEBHOOK, suppressWebhook: true },
    );
    expect(second.notification).toBeNull();
  });

  it("IN_STOCK -> OUT_OF_STOCK fires stock-change alert", async () => {
    const now = Date.now();
    const item = insertMcItem(env.db, {}, [
      {
        storeNumber: "131",
        storeName: "Tustin",
        alertEnabled: 1,
        lastStockStatus: "IN_STOCK",
        lastQoh: 2,
        lastNotifiedAt: now - 1000,
      },
    ]);

    const outcome = await applyMicroCenterCheckResult(
      item.id,
      okMc([{ storeNumber: "131", storeName: "Tustin", qoh: 0 }]),
      { db: env.db, now, webhookUrl: WEBHOOK, suppressWebhook: true },
    );

    expect(outcome.notification).toBe("out_of_stock");
    expect(outcome.transitioned).toBe(true);

    const tustin = rereadStores(env.db, item.id).find((s) => s.storeNumber === "131")!;
    expect(tustin.lastStockStatus).toBe("OUT_OF_STOCK");
    expect(tustin.lastNotifiedAt).toBe(now);
  });

  it("Missing store entry in result does not crash; iterated store still transitions", async () => {
    const now = Date.now();
    const item = insertMcItem(env.db, {}, [
      {
        storeNumber: "131",
        storeName: "Tustin",
        alertEnabled: 1,
        lastStockStatus: "IN_STOCK",
        lastQoh: 2,
        lastNotifiedAt: now - 1000,
      },
      {
        storeNumber: "065",
        storeName: "Westmont",
        alertEnabled: 1,
        lastStockStatus: "IN_STOCK",
        lastQoh: 1,
        lastNotifiedAt: now - 1000,
      },
    ]);

    // Result only includes 131; 065 omitted.
    const outcome = await applyMicroCenterCheckResult(
      item.id,
      okMc([{ storeNumber: "131", storeName: "Tustin", qoh: 0 }]),
      { db: env.db, now, webhookUrl: WEBHOOK, suppressWebhook: true },
    );

    expect(outcome.notification).toBe("out_of_stock");

    const stores = rereadStores(env.db, item.id);
    const tustin = stores.find((s) => s.storeNumber === "131")!;
    const westmont = stores.find((s) => s.storeNumber === "065")!;

    // 131 was iterated → flipped to OOS.
    expect(tustin.lastStockStatus).toBe("OUT_OF_STOCK");
    // 065 was omitted → state preserved.
    expect(westmont.lastStockStatus).toBe("IN_STOCK");
    expect(westmont.lastQoh).toBe(1);
  });

  it("New store in result auto-inserts row with alertEnabled=1", async () => {
    const now = Date.now();
    const item = insertMcItem(env.db, {}, [
      { storeNumber: "029", storeName: "Shippable Items", alertEnabled: 1, lastStockStatus: "OUT_OF_STOCK", lastQoh: 0 },
    ]);

    await applyMicroCenterCheckResult(
      item.id,
      okMc([
        { storeNumber: "029", storeName: "Shippable Items", qoh: 0 },
        { storeNumber: "131", storeName: "Tustin", qoh: 5 },
      ]),
      { db: env.db, now, webhookUrl: WEBHOOK, suppressWebhook: true },
    );

    const stores = rereadStores(env.db, item.id);
    expect(stores).toHaveLength(2);
    const tustin = stores.find((s) => s.storeNumber === "131")!;
    expect(tustin).toBeDefined();
    expect(tustin.storeName).toBe("Tustin");
    expect(tustin.alertEnabled).toBe(1);
    expect(tustin.lastStockStatus).toBe("IN_STOCK");
    expect(tustin.lastQoh).toBe(5);
  });

  it("Item rollup: lastStockStatus=IN_STOCK when ANY enabled store has stock", async () => {
    const now = Date.now();
    const item = insertMcItem(env.db, {}, [
      { storeNumber: "131", storeName: "Tustin", alertEnabled: 1, lastStockStatus: "OUT_OF_STOCK", lastQoh: 0 },
      { storeNumber: "065", storeName: "Westmont", alertEnabled: 1, lastStockStatus: "OUT_OF_STOCK", lastQoh: 0 },
      { storeNumber: "029", storeName: "Shippable Items", alertEnabled: 1, lastStockStatus: "OUT_OF_STOCK", lastQoh: 0 },
    ]);

    await applyMicroCenterCheckResult(
      item.id,
      okMc([
        { storeNumber: "131", storeName: "Tustin", qoh: 2 },
        { storeNumber: "065", storeName: "Westmont", qoh: 0 },
        { storeNumber: "029", storeName: "Shippable Items", qoh: 0 },
      ]),
      { db: env.db, now, webhookUrl: WEBHOOK, suppressWebhook: true },
    );

    expect(reread(env.db, item.id).lastStockStatus).toBe("IN_STOCK");
  });

  it("Item rollup: lastStockStatus=OUT_OF_STOCK when only disabled stores have stock", async () => {
    const now = Date.now();
    const item = insertMcItem(env.db, {}, [
      { storeNumber: "131", storeName: "Tustin", alertEnabled: 0, lastStockStatus: "OUT_OF_STOCK", lastQoh: 0 },
      { storeNumber: "065", storeName: "Westmont", alertEnabled: 1, lastStockStatus: "OUT_OF_STOCK", lastQoh: 0 },
      { storeNumber: "029", storeName: "Shippable Items", alertEnabled: 1, lastStockStatus: "OUT_OF_STOCK", lastQoh: 0 },
    ]);

    await applyMicroCenterCheckResult(
      item.id,
      okMc([
        { storeNumber: "131", storeName: "Tustin", qoh: 5 },
        { storeNumber: "065", storeName: "Westmont", qoh: 0 },
        { storeNumber: "029", storeName: "Shippable Items", qoh: 0 },
      ]),
      { db: env.db, now, webhookUrl: WEBHOOK, suppressWebhook: true },
    );

    expect(reread(env.db, item.id).lastStockStatus).toBe("OUT_OF_STOCK");
  });

  it("Error result bumps consecutive_errors and writes ERROR event", async () => {
    const now = Date.now();
    const item = insertMcItem(env.db, {}, [
      { storeNumber: "131", storeName: "Tustin", alertEnabled: 1, lastStockStatus: "UNKNOWN" },
    ]);

    const outcome = await applyMicroCenterCheckResult(
      item.id,
      { ok: false, mcProductId: "688173", error: "HTTP 502" },
      { db: env.db, now, webhookUrl: WEBHOOK, suppressWebhook: true },
    );

    expect(outcome.notification).toBeNull();

    const after = reread(env.db, item.id);
    expect(after.consecutiveErrors).toBe(1);
    expect(after.lastHealthMessage).toBe("HTTP 502");

    const events = getEvents(env.db, item.id);
    const errEvent = events.find((e) => e.status === "ERROR");
    expect(errEvent).toBeDefined();
    expect(errEvent?.message).toBe("HTTP 502");
  });

  it("Auto-disable after 10 consecutive errors", async () => {
    const now = Date.now();
    const item = insertMcItem(env.db, { consecutiveErrors: 9 }, [
      { storeNumber: "131", storeName: "Tustin", alertEnabled: 1, lastStockStatus: "UNKNOWN" },
    ]);

    await applyMicroCenterCheckResult(
      item.id,
      { ok: false, mcProductId: "688173", error: "HTTP 502" },
      { db: env.db, now, webhookUrl: WEBHOOK, suppressWebhook: true },
    );

    const after = reread(env.db, item.id);
    expect(after.consecutiveErrors).toBe(10);
    expect(after.enabled).toBe(0);
    expect(after.healthStatus).toBe("ERROR");
  });

  it("suppressWebhook: webhook not fired but state still updates (webhookOk = null)", async () => {
    const now = Date.now();
    const item = insertMcItem(env.db, {}, [
      { storeNumber: "131", storeName: "Tustin", alertEnabled: 1, lastStockStatus: "OUT_OF_STOCK", lastQoh: 0 },
    ]);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const outcome = await applyMicroCenterCheckResult(
      item.id,
      okMc([{ storeNumber: "131", storeName: "Tustin", qoh: 1 }]),
      { db: env.db, now, webhookUrl: WEBHOOK, suppressWebhook: true },
    );

    expect(outcome.notification).toBe("alert");
    expect(outcome.webhookOk).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();

    const tustin = rereadStores(env.db, item.id).find((s) => s.storeNumber === "131")!;
    expect(tustin.lastStockStatus).toBe("IN_STOCK");
    expect(tustin.lastNotifiedAt).toBe(now);
  });
});
