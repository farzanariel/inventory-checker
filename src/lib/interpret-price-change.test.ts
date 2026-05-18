/**
 * Unit tests for decidePriceAlert — the target-price / price-drop decision
 * function (SPEC §19 v5+, target-price model).
 *
 * Tests map to the six-row decision table called out in §16:
 *   price alerts disabled, above target, first observation, second observation
 *   (fire), cooldown active, suppressed while OOS.
 *
 * Also covers drop mode and the stale-price guard (different-candidate resets).
 */
import { describe, test, expect } from "vitest";
import { decidePriceAlert } from "./checker";
import type { Item } from "./db/schema";

const NOW = 1_700_000_000_000;

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    retailer: "bestbuy",
    sku: "6587182",
    mcProductId: null,
    name: "Test Product",
    brand: null,
    imageUrl: null,
    productUrl: "https://www.bestbuy.com/site/-/6587182.p",
    currentPriceCents: 15900,
    regularPriceCents: null,
    checkIntervalMin: 1,
    restockNotifyIntervalMin: 10,
    stockAlertEnabled: 1,
    stockNotifyMode: "repeat",
    enabled: 1,
    note: null,
    upc: null,
    condition: null,
    seller: null,
    sellerId: null,
    saleEndsAt: null,
    sortOrder: null,
    lastStockStatus: "IN_STOCK",
    lastButtonState: "ADD_TO_CART",
    healthStatus: "OK",
    lastHealthMessage: null,
    consecutiveErrors: 0,
    lastCheckedAt: NOW - 60_000,
    lastInStockAt: NOW - 60_000,
    lastNotifiedAt: null,
    nextCheckDueAt: NOW,
    priceAlertEnabled: 1,
    targetPriceCents: null,
    priceNotifyIntervalMin: 60,
    priceNotifyMode: "repeat",
    lastPriceNotifiedAt: null,
    priceAlertWhileOos: 1,
    pendingHitPriceCents: null,
    pendingHitSeenCount: 0,
    createdAt: NOW - 3600_000,
    updatedAt: NOW - 60_000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Target mode
// ---------------------------------------------------------------------------

describe("decidePriceAlert — target mode", () => {
  test("row 1: price alerts disabled → no-op", () => {
    const item = makeItem({
      priceAlertEnabled: 0,
      targetPriceCents: 14000,
    });
    const d = decidePriceAlert(item, 12000, "IN_STOCK", NOW);
    expect(d.notification).toBeNull();
    expect(d.event).toBeNull();
  });

  test("row 2: current price above target → no-op, clears pending", () => {
    const item = makeItem({ targetPriceCents: 12000 });
    const d = decidePriceAlert(item, 13000, "IN_STOCK", NOW);
    expect(d.notification).toBeNull();
    expect(d.patch.pendingHitPriceCents).toBeNull();
    expect(d.patch.pendingHitSeenCount).toBe(0);
  });

  test("row 3: price at or below target — first observation (no fire)", () => {
    const item = makeItem({ targetPriceCents: 15000 });
    const d = decidePriceAlert(item, 14000, "IN_STOCK", NOW);
    expect(d.notification).toBeNull();
    expect(d.patch.pendingHitPriceCents).toBe(14000);
    expect(d.patch.pendingHitSeenCount).toBe(1);
  });

  test("row 4: second consecutive hit at same price → FIRE", () => {
    const item = makeItem({
      targetPriceCents: 15000,
      pendingHitPriceCents: 14000,
      pendingHitSeenCount: 1,
    });
    const d = decidePriceAlert(item, 14000, "IN_STOCK", NOW);
    expect(d.notification).toBe("price_drop");
    expect(d.event?.mode).toBe("target");
    expect(d.event?.oldPriceCents).toBe(15000);
    expect(d.event?.newPriceCents).toBe(14000);
    expect(d.patch.lastPriceNotifiedAt).toBe(NOW);
    expect(d.patch.pendingHitPriceCents).toBeNull();
    expect(d.patch.pendingHitSeenCount).toBe(0);
  });

  test("row 5: cooldown active → no fire even on confirmed hit", () => {
    const item = makeItem({
      targetPriceCents: 15000,
      pendingHitPriceCents: 14000,
      pendingHitSeenCount: 1,
      lastPriceNotifiedAt: NOW - 10_000, // 10s ago, cooldown is 60min
    });
    const d = decidePriceAlert(item, 14000, "IN_STOCK", NOW);
    expect(d.notification).toBeNull();
    expect(d.reason).toMatch(/cooldown/i);
  });

  test("row 6: suppressed while OOS when priceAlertWhileOos=0", () => {
    const item = makeItem({
      targetPriceCents: 15000,
      pendingHitPriceCents: 14000,
      pendingHitSeenCount: 1,
      priceAlertWhileOos: 0,
    });
    const d = decidePriceAlert(item, 14000, "OUT_OF_STOCK", NOW);
    expect(d.notification).toBeNull();
    expect(d.reason).toMatch(/suppress/i);
  });

  test("different lower price resets pending count to 1 for new candidate", () => {
    // first observation at 14000, now price is 13500 (different candidate)
    const item = makeItem({
      targetPriceCents: 15000,
      pendingHitPriceCents: 14000,
      pendingHitSeenCount: 1,
    });
    const d = decidePriceAlert(item, 13500, "IN_STOCK", NOW);
    // 13500 is a different price from pending 14000 → reset count to 1
    expect(d.notification).toBeNull();
    expect(d.patch.pendingHitPriceCents).toBe(13500);
    expect(d.patch.pendingHitSeenCount).toBe(1);
  });

  test("once mode: already fired → permanent silence", () => {
    const item = makeItem({
      targetPriceCents: 15000,
      priceNotifyMode: "once",
      lastPriceNotifiedAt: NOW - 24 * 3600_000, // fired yesterday
      pendingHitPriceCents: 14000,
      pendingHitSeenCount: 1,
    });
    const d = decidePriceAlert(item, 14000, "IN_STOCK", NOW);
    expect(d.notification).toBeNull();
    expect(d.reason).toMatch(/cooldown/i);
  });
});

// ---------------------------------------------------------------------------
// Drop mode (no targetPriceCents set)
// ---------------------------------------------------------------------------

describe("decidePriceAlert — drop mode", () => {
  test("no prior price → no-op", () => {
    const item = makeItem({ currentPriceCents: null, targetPriceCents: null });
    const d = decidePriceAlert(item, 14000, "IN_STOCK", NOW);
    expect(d.notification).toBeNull();
    expect(d.reason).toMatch(/no prior price/i);
  });

  test("price increase vs anchor → no-op, clears pending", () => {
    const item = makeItem({ currentPriceCents: 14000, targetPriceCents: null });
    const d = decidePriceAlert(item, 15000, "IN_STOCK", NOW);
    expect(d.notification).toBeNull();
    expect(d.patch.pendingHitPriceCents).toBeNull();
  });

  test("price decrease — first observation", () => {
    const item = makeItem({ currentPriceCents: 15000, targetPriceCents: null });
    const d = decidePriceAlert(item, 14000, "IN_STOCK", NOW);
    expect(d.notification).toBeNull();
    expect(d.patch.pendingHitPriceCents).toBe(15000); // anchor captured
    expect(d.patch.pendingHitSeenCount).toBe(1);
  });

  test("price decrease — second consecutive hit → FIRE", () => {
    const item = makeItem({
      currentPriceCents: 15000,
      targetPriceCents: null,
      pendingHitPriceCents: 15000, // anchor
      pendingHitSeenCount: 1,
    });
    const d = decidePriceAlert(item, 14000, "IN_STOCK", NOW);
    expect(d.notification).toBe("price_drop");
    expect(d.event?.mode).toBe("drop");
    expect(d.event?.oldPriceCents).toBe(15000);
    expect(d.event?.newPriceCents).toBe(14000);
  });

  test("cooldown blocks fire in drop mode", () => {
    const item = makeItem({
      currentPriceCents: 15000,
      targetPriceCents: null,
      pendingHitPriceCents: 15000,
      pendingHitSeenCount: 1,
      lastPriceNotifiedAt: NOW - 100, // just fired
    });
    const d = decidePriceAlert(item, 14000, "IN_STOCK", NOW);
    expect(d.notification).toBeNull();
    expect(d.reason).toMatch(/cooldown/i);
  });
});
