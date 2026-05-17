/**
 * Sync/merge tests for deals-sync (SPEC §22.9).
 *
 * Uses in-memory SQLite via makeTestDb. No HTTP — we feed canned feed
 * payloads through `applyFeedToDb`.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";

import {
  dealGroups,
  dealPriceHistory,
  dealsSync,
  itemDeals,
  items,
} from "./db/schema";
import { applyFeedToDb, pruneDealHistory } from "./deals-sync";
import type { DealsFeed } from "./deals-feed";
import { makeTestDb } from "./test-db";

type Db = ReturnType<typeof makeTestDb>["db"];

const NOW = 1_700_000_000_000;

function baseItem(overrides: Record<string, unknown> = {}) {
  return {
    retailer: "bestbuy",
    sku: "6587410",
    name: "Test",
    brand: null,
    imageUrl: null,
    productUrl: "https://www.bestbuy.com/site/-/6587410.p",
    currentPriceCents: 24900,
    regularPriceCents: null,
    checkIntervalMin: 1,
    restockNotifyIntervalMin: 10,
    stockAlertEnabled: 1,
    stockNotifyMode: "repeat",
    enabled: 1,
    note: null,
    upc: "850049670302",
    lastStockStatus: "UNKNOWN",
    lastButtonState: null,
    healthStatus: "OK",
    lastHealthMessage: null,
    consecutiveErrors: 0,
    priceAlertEnabled: 1,
    targetPriceCents: null,
    priceNotifyIntervalMin: 60,
    priceNotifyMode: "repeat",
    lastPriceNotifiedAt: null,
    priceAlertWhileOos: 1,
    pendingHitPriceCents: null,
    pendingHitSeenCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function feed(deals: Record<string, unknown>, updated = 1): DealsFeed {
  return { updated, deals } as DealsFeed;
}

function offer(overrides: Record<string, unknown> = {}) {
  return {
    productList: [],
    retailPrice: 249,
    groupPrice: 250,
    isAvailable: true,
    title: "Mini Kit",
    source: "buyformeretail:bfmr.com",
    url: "https://bfmr.com/deal/1",
    ...overrides,
  };
}

let db: Db;
beforeEach(() => {
  db = makeTestDb().db;
});

describe("applyFeedToDb — first sync", () => {
  test("inserts snapshot + history for UPC match", () => {
    db.insert(items).values(baseItem()).run();

    const out = applyFeedToDb(
      db,
      feed({ "upc:850049670302": [offer()] }),
      NOW,
    );

    expect(out.ok).toBe(true);
    expect(out.matchedItemCount).toBe(1);
    expect(out.matchedDealRows).toBe(1);
    expect(out.historyInserts).toBe(1);

    const snap = db.select().from(itemDeals).all();
    expect(snap).toHaveLength(1);
    expect(snap[0]).toMatchObject({
      groupPriceCents: 25000,
      retailPriceCents: 24900,
      isAvailable: 1,
      matchKind: "upc",
    });

    const hist = db.select().from(dealPriceHistory).all();
    expect(hist).toHaveLength(1);

    const groups = db.select().from(dealGroups).all();
    expect(groups).toHaveLength(1);
    expect(groups[0].source).toBe("buyformeretail:bfmr.com");
  });

  test("URL fallback when UPC absent on item", () => {
    db.insert(items).values(baseItem({ upc: null })).run();

    const out = applyFeedToDb(
      db,
      feed({
        "model:X": [
          offer({
            productList: [
              {
                links: [
                  { url: "https://www.bestbuy.com/site/x/6587410.p" },
                ],
              },
            ],
          }),
        ],
      }),
      NOW,
    );

    expect(out.matchedDealRows).toBe(1);
    const snap = db.select().from(itemDeals).all();
    expect(snap[0].matchKind).toBe("url");
  });

  test("UPC match preferred over URL match", () => {
    db.insert(items).values(baseItem()).run();
    const out = applyFeedToDb(
      db,
      feed({
        "upc:850049670302": [offer({ groupPrice: 250 })],
        "model:X": [
          offer({
            source: "buyformeretail:bfmr.com",
            groupPrice: 999,
            productList: [
              { links: [{ url: "https://www.bestbuy.com/site/x/6587410.p" }] },
            ],
          }),
        ],
      }),
      NOW,
    );
    expect(out.matchedDealRows).toBe(1);
    const snap = db.select().from(itemDeals).all();
    expect(snap[0].matchKind).toBe("upc");
    expect(snap[0].groupPriceCents).toBe(25000);
  });
});

describe("applyFeedToDb — re-sync diff", () => {
  function setupAndSync(payload: DealsFeed, atMs: number) {
    return applyFeedToDb(db, payload, atMs);
  }

  test("unchanged feed short-circuits", () => {
    db.insert(items).values(baseItem()).run();
    const f = feed({ "upc:850049670302": [offer()] }, 100);
    setupAndSync(f, NOW);
    const out = setupAndSync(f, NOW + 1);
    expect(out.skipped).toBe("unchanged");
  });

  test("identical price re-sync appends no history rows", () => {
    db.insert(items).values(baseItem()).run();
    setupAndSync(feed({ "upc:850049670302": [offer()] }, 1), NOW);
    const out = setupAndSync(
      feed({ "upc:850049670302": [offer()] }, 2),
      NOW + 1000,
    );
    expect(out.historyInserts).toBe(0);
    expect(db.select().from(dealPriceHistory).all()).toHaveLength(1);
  });

  test("price change appends exactly one history row", () => {
    db.insert(items).values(baseItem()).run();
    setupAndSync(feed({ "upc:850049670302": [offer({ groupPrice: 250 })] }, 1), NOW);
    setupAndSync(feed({ "upc:850049670302": [offer({ groupPrice: 240 })] }, 2), NOW + 1000);
    const hist = db.select().from(dealPriceHistory).all();
    expect(hist).toHaveLength(2);
    expect(hist[1].groupPriceCents).toBe(24000);
  });

  test("availability flip appends one history row", () => {
    db.insert(items).values(baseItem()).run();
    setupAndSync(feed({ "upc:850049670302": [offer({ isAvailable: true })] }, 1), NOW);
    setupAndSync(feed({ "upc:850049670302": [offer({ isAvailable: false })] }, 2), NOW + 1000);
    const hist = db.select().from(dealPriceHistory).all();
    expect(hist).toHaveLength(2);
    expect(hist[1].isAvailable).toBe(0);
  });

  test("offer disappearing upstream wipes snapshot but keeps history", () => {
    db.insert(items).values(baseItem()).run();
    setupAndSync(feed({ "upc:850049670302": [offer()] }, 1), NOW);
    setupAndSync(feed({}, 2), NOW + 1000);
    expect(db.select().from(itemDeals).all()).toHaveLength(0);
    expect(db.select().from(dealPriceHistory).all()).toHaveLength(1);
  });
});

describe("deals_sync meta row", () => {
  test("populated after first successful sync", () => {
    db.insert(items).values(baseItem()).run();
    applyFeedToDb(db, feed({ "upc:850049670302": [offer()] }, 42), NOW);
    const meta = db.select().from(dealsSync).where(eq(dealsSync.id, 1)).get();
    expect(meta).toMatchObject({
      lastUpstreamUpdated: 42,
      lastSyncOk: 1,
      lastError: null,
      dealCount: 1,
      matchedItemCount: 1,
    });
  });
});

describe("pruneDealHistory", () => {
  test("deletes rows older than cutoff", () => {
    db.insert(items).values(baseItem()).run();
    // Seed history with two rows: one ancient, one recent.
    applyFeedToDb(db, feed({ "upc:850049670302": [offer({ groupPrice: 250 })] }, 1), NOW - 200);
    applyFeedToDb(db, feed({ "upc:850049670302": [offer({ groupPrice: 240 })] }, 2), NOW);
    const cutoff = NOW - 50;
    const deleted = pruneDealHistory(db, cutoff);
    expect(deleted).toBe(1);
    expect(db.select().from(dealPriceHistory).all()).toHaveLength(1);
  });
});
