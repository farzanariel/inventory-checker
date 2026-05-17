/**
 * Read helpers for the buying-group deals data (SPEC §22.7).
 *
 * Used by the items API to attach `deals` and `dealsSummary` to each row,
 * and by the history endpoint.
 */
import { asc, eq, inArray } from 'drizzle-orm';

import type { getDb } from './db/client';
import {
  dealGroups,
  dealPriceHistory,
  dealsSync,
  itemDeals,
  type Item,
} from './db/schema';

type DrizzleDb = ReturnType<typeof getDb>;

export interface ItemDealDto {
  source: string;
  displayName: string;
  groupPriceCents: number;
  retailPriceCents: number | null;
  isAvailable: boolean;
  dealUrl: string;
  dealTitle: string | null;
  matchKind: 'upc' | 'url';
  fetchedAt: number;
}

export interface ItemDealsSummary {
  groupCount: number;
  bestGroupPriceCents: number | null;
  bestSource: string | null;
  marginCents: number | null;
  lastSyncAt: number | null;
  hasUpc: boolean;
}

export interface ItemWithDeals extends Item {
  deals: ItemDealDto[];
  dealsSummary: ItemDealsSummary;
}

/**
 * Attach `deals` + `dealsSummary` to a list of items. Issues two SQL queries
 * total regardless of list size.
 */
export function attachDealsToItems(
  db: DrizzleDb,
  itemRows: Item[],
): ItemWithDeals[] {
  if (itemRows.length === 0) return [];

  const ids = itemRows.map((i) => i.id);
  const dealRows = db
    .select({
      itemId: itemDeals.itemId,
      source: dealGroups.source,
      displayName: dealGroups.displayName,
      groupPriceCents: itemDeals.groupPriceCents,
      retailPriceCents: itemDeals.retailPriceCents,
      isAvailable: itemDeals.isAvailable,
      dealUrl: itemDeals.dealUrl,
      dealTitle: itemDeals.dealTitle,
      matchKind: itemDeals.matchKind,
      fetchedAt: itemDeals.fetchedAt,
    })
    .from(itemDeals)
    .innerJoin(dealGroups, eq(itemDeals.groupId, dealGroups.id))
    .where(inArray(itemDeals.itemId, ids))
    .all();

  const meta = db.select().from(dealsSync).where(eq(dealsSync.id, 1)).get();
  const lastSyncAt = meta?.lastSyncAt ?? null;

  const byItem = new Map<number, ItemDealDto[]>();
  for (const r of dealRows) {
    let arr = byItem.get(r.itemId);
    if (!arr) byItem.set(r.itemId, (arr = []));
    arr.push({
      source: r.source,
      displayName: r.displayName,
      groupPriceCents: r.groupPriceCents,
      retailPriceCents: r.retailPriceCents,
      isAvailable: r.isAvailable === 1,
      dealUrl: r.dealUrl,
      dealTitle: r.dealTitle,
      matchKind: r.matchKind === 'url' ? 'url' : 'upc',
      fetchedAt: r.fetchedAt,
    });
  }

  return itemRows.map((item) => {
    const deals = (byItem.get(item.id) ?? []).sort(
      (a, b) => b.groupPriceCents - a.groupPriceCents,
    );
    const best = deals.reduce<ItemDealDto | null>(
      (acc, d) =>
        acc == null || d.groupPriceCents > acc.groupPriceCents ? d : acc,
      null,
    );
    const marginCents =
      best && item.currentPriceCents != null
        ? best.groupPriceCents - item.currentPriceCents
        : null;
    const summary: ItemDealsSummary = {
      groupCount: deals.length,
      bestGroupPriceCents: best?.groupPriceCents ?? null,
      bestSource: best?.source ?? null,
      marginCents,
      lastSyncAt,
      hasUpc: typeof item.upc === 'string' && item.upc.length > 0,
    };
    return { ...item, deals, dealsSummary: summary };
  });
}

export interface DealHistoryPoint {
  groupId: number;
  source: string;
  displayName: string;
  ts: number;
  groupPriceCents: number;
  isAvailable: boolean;
}

export function getDealHistoryForItem(
  db: DrizzleDb,
  itemId: number,
  groupId?: number,
): DealHistoryPoint[] {
  const q = db
    .select({
      groupId: dealPriceHistory.groupId,
      source: dealGroups.source,
      displayName: dealGroups.displayName,
      ts: dealPriceHistory.ts,
      groupPriceCents: dealPriceHistory.groupPriceCents,
      isAvailable: dealPriceHistory.isAvailable,
    })
    .from(dealPriceHistory)
    .innerJoin(dealGroups, eq(dealPriceHistory.groupId, dealGroups.id))
    .where(eq(dealPriceHistory.itemId, itemId))
    .orderBy(asc(dealPriceHistory.ts));
  const rows = q.all();
  const filtered =
    groupId == null ? rows : rows.filter((r) => r.groupId === groupId);
  return filtered.map((r) => ({
    groupId: r.groupId,
    source: r.source,
    displayName: r.displayName,
    ts: r.ts,
    groupPriceCents: r.groupPriceCents,
    isAvailable: r.isAvailable === 1,
  }));
}
