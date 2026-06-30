import { describe, expect, test } from "vitest";
import { makeTestDb } from "@/lib/test-db";
import { items } from "@/lib/db/schema";
import { selectItemsForTick } from "./index";

type TestDb = ReturnType<typeof makeTestDb>["db"];

const NOW = 1_700_000_000_000;

function insertItem(
  db: TestDb,
  overrides: Partial<typeof items.$inferInsert> = {},
) {
  return db
    .insert(items)
    .values({
      sku: `sku-${Math.random()}`,
      productUrl: "https://www.bestbuy.com/site/-/1234567.p",
      createdAt: NOW - 60_000,
      updatedAt: NOW - 60_000,
      ...overrides,
    })
    .returning({ id: items.id })
    .get();
}

describe("selectItemsForTick", () => {
  test("includes near-due Best Buy items with the same interval", () => {
    const { db } = makeTestDb();
    insertItem(db, {
      sku: "1000001",
      checkIntervalMin: 1,
      nextCheckDueAt: NOW - 1,
    });
    insertItem(db, {
      sku: "1000002",
      checkIntervalMin: 1,
      nextCheckDueAt: NOW + 5_000,
    });
    insertItem(db, {
      sku: "1000003",
      checkIntervalMin: 5,
      nextCheckDueAt: NOW + 5_000,
    });
    insertItem(db, {
      sku: "1000004",
      checkIntervalMin: 1,
      nextCheckDueAt: NOW + 30_000,
    });
    insertItem(db, {
      sku: "1000005",
      checkIntervalMin: 1,
      nextCheckDueAt: NOW + 5_000,
      enabled: 0,
    });

    const selected = selectItemsForTick(db, NOW);

    expect(selected.map((item) => item.sku)).toEqual(["1000001", "1000002"]);
  });

  test("does not pull lookahead items when nothing is due", () => {
    const { db } = makeTestDb();
    insertItem(db, {
      sku: "1000001",
      checkIntervalMin: 1,
      nextCheckDueAt: NOW + 5_000,
    });

    expect(selectItemsForTick(db, NOW)).toHaveLength(0);
  });

  test("does not use MicroCenter due items to pull Best Buy lookahead items", () => {
    const { db } = makeTestDb();
    insertItem(db, {
      retailer: "microcenter",
      sku: null,
      mcProductId: "123456",
      productUrl: "https://www.microcenter.com/product/123456/example",
      checkIntervalMin: 1,
      nextCheckDueAt: NOW - 1,
    });
    insertItem(db, {
      sku: "1000001",
      checkIntervalMin: 1,
      nextCheckDueAt: NOW + 5_000,
    });

    const selected = selectItemsForTick(db, NOW);

    expect(selected).toHaveLength(1);
    expect(selected[0].retailer).toBe("microcenter");
  });
});
