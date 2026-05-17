/**
 * Buying-group deals sync (SPEC §22).
 *
 * Fetches the upstream snapshot, joins offers to local items by UPC (primary)
 * or BB URL (fallback), and persists:
 *   - `deal_groups`     — directory of group sources (upserted as seen).
 *   - `item_deals`      — full snapshot for currently-matched items.
 *   - `deal_price_history` — append-on-change log.
 *   - `deals_sync`      — singleton meta row (short-circuits identical pulls).
 *
 * All persistence happens inside one BEGIN IMMEDIATE transaction so concurrent
 * worker stock-poll writes (different tables) never observe a partial sync.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import type { getDb } from './db/client';
import {
  dealGroups,
  dealPriceHistory,
  dealsSync,
  itemDeals,
  items,
} from './db/schema';
import {
  bbSkusFromOffer,
  displayNameForSource,
  homepageUrlForSource,
  parseDealKey,
  type DealsFeed,
  type DealsFeedOffer,
} from './deals-feed';

const FEED_URL = 'https://tbs.dapper.codes/deals.json';
const DEFAULT_TIMEOUT_MS = 15_000;

type DrizzleDb = ReturnType<typeof getDb>;

export interface DealsSyncOutcome {
  ok: boolean;
  skipped?: 'unchanged' | undefined;
  upstreamUpdated?: number;
  dealCount?: number;
  matchedItemCount?: number;
  matchedDealRows?: number;
  historyInserts?: number;
  error?: string;
  durationMs: number;
}

// ─── Public entry points ────────────────────────────────────────────────────

export async function fetchDealsFeed(
  url = FEED_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<DealsFeed> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) {
      throw new Error(`deals feed HTTP ${r.status}`);
    }
    const body = (await r.json()) as DealsFeed;
    if (typeof body?.updated !== 'number' || typeof body?.deals !== 'object') {
      throw new Error('deals feed: malformed response');
    }
    return body;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Run a full sync against the live feed. Safe to call concurrently with
 * per-item stock polls — the persistence step uses distinct tables.
 */
export async function syncDeals(
  db: DrizzleDb,
  opts: { fetchFeed?: () => Promise<DealsFeed>; now?: () => number } = {},
): Promise<DealsSyncOutcome> {
  const start = Date.now();
  const fetchFeed = opts.fetchFeed ?? (() => fetchDealsFeed());
  const now = opts.now ?? (() => Date.now());

  try {
    const feed = await fetchFeed();
    return applyFeedToDb(db, feed, now(), start);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    upsertSyncMeta(db, {
      lastSyncAt: now(),
      lastSyncOk: 0,
      lastError: message,
    });
    return { ok: false, error: message, durationMs: Date.now() - start };
  }
}

/**
 * Apply a parsed feed payload to the DB. Extracted from `syncDeals` so tests
 * can feed canned payloads without HTTP.
 */
export function applyFeedToDb(
  db: DrizzleDb,
  feed: DealsFeed,
  nowMs: number,
  startMs: number = nowMs,
): DealsSyncOutcome {
  // Always run the display-name heal first, even when we're about to
  // short-circuit on `feed.updated`. Cheap (~20 rows) and means edits to
  // KNOWN_GROUP_NAMES take effect on the next sync without needing the
  // upstream feed to change.
  healGroupDisplayNames(db);

  const prev = db.select().from(dealsSync).where(eq(dealsSync.id, 1)).get();
  if (prev && prev.lastUpstreamUpdated === feed.updated) {
    upsertSyncMeta(db, {
      lastSyncAt: nowMs,
      lastSyncOk: 1,
      lastError: null,
    });
    return {
      ok: true,
      skipped: 'unchanged',
      upstreamUpdated: feed.updated,
      durationMs: Date.now() - startMs,
    };
  }

  // 1. Build upc → offers and sku → offers maps from the feed.
  const upcMap = new Map<string, Array<{ key: string; offer: DealsFeedOffer }>>();
  const skuMap = new Map<string, Array<{ key: string; offer: DealsFeedOffer }>>();
  const sourcesSeen = new Set<string>();
  let totalOffers = 0;

  for (const [key, offers] of Object.entries(feed.deals)) {
    const parsed = parseDealKey(key);
    for (const offer of offers) {
      totalOffers++;
      if (typeof offer.source === 'string') sourcesSeen.add(offer.source);
      if (parsed.upc) {
        let arr = upcMap.get(parsed.upc);
        if (!arr) upcMap.set(parsed.upc, (arr = []));
        arr.push({ key, offer });
      }
      for (const sku of bbSkusFromOffer(offer)) {
        let arr = skuMap.get(sku);
        if (!arr) skuMap.set(sku, (arr = []));
        arr.push({ key, offer });
      }
    }
  }

  // 2. Load all BB items (small table; full scan is fine).
  const bbItems = db
    .select({ id: items.id, sku: items.sku, upc: items.upc })
    .from(items)
    .where(eq(items.retailer, 'bestbuy'))
    .all();

  // 3. Upsert deal_groups for every source seen; build source → groupId.
  const groupIdBySource = ensureGroupsExist(db, sourcesSeen, nowMs);

  let matchedItems = 0;
  let matchedRows = 0;
  let historyInserts = 0;

  db.transaction((tx) => {
    for (const item of bbItems) {
      // UPC primary, URL fallback. We DO NOT mix sources: UPC takes the row,
      // URL only fills in when UPC produced nothing.
      let matches: Array<{ offer: DealsFeedOffer; kind: 'upc' | 'url' }> = [];
      if (item.upc) {
        const fromUpc = upcMap.get(item.upc) ?? [];
        matches = fromUpc.map((m) => ({ offer: m.offer, kind: 'upc' as const }));
      }
      if (matches.length === 0 && item.sku) {
        const fromUrl = skuMap.get(item.sku) ?? [];
        matches = fromUrl.map((m) => ({ offer: m.offer, kind: 'url' as const }));
      }

      // De-dupe by source — same group may appear under multiple deal keys
      // (e.g. one with UPC, one with model). Keep the cheapest offer.
      const bestBySource = new Map<
        string,
        { offer: DealsFeedOffer; kind: 'upc' | 'url' }
      >();
      for (const m of matches) {
        const src = m.offer.source;
        if (typeof src !== 'string') continue;
        const existing = bestBySource.get(src);
        if (
          !existing ||
          (typeof m.offer.groupPrice === 'number' &&
            (existing.offer.groupPrice == null ||
              m.offer.groupPrice < existing.offer.groupPrice))
        ) {
          bestBySource.set(src, m);
        }
      }

      // Wipe and rewrite this item's snapshot rows.
      tx.delete(itemDeals).where(eq(itemDeals.itemId, item.id)).run();

      if (bestBySource.size === 0) continue;
      matchedItems++;

      for (const [source, m] of bestBySource) {
        const groupId = groupIdBySource.get(source);
        if (groupId == null) continue;
        if (typeof m.offer.groupPrice !== 'number') continue;
        const groupPriceCents = Math.round(m.offer.groupPrice * 100);
        const retailPriceCents =
          typeof m.offer.retailPrice === 'number'
            ? Math.round(m.offer.retailPrice * 100)
            : null;
        const isAvailable = m.offer.isAvailable ? 1 : 0;
        const dealUrl = m.offer.url ?? '';
        const dealTitle = m.offer.title ?? null;

        tx.insert(itemDeals)
          .values({
            itemId: item.id,
            groupId,
            groupPriceCents,
            retailPriceCents,
            isAvailable,
            dealUrl,
            dealTitle,
            matchKind: m.kind,
            fetchedAt: nowMs,
          })
          .run();
        matchedRows++;

        // Append history row only if (price, availability) differs from
        // the most recent prior entry for this (item, group).
        const latest = tx
          .select({
            price: dealPriceHistory.groupPriceCents,
            avail: dealPriceHistory.isAvailable,
          })
          .from(dealPriceHistory)
          .where(
            and(
              eq(dealPriceHistory.itemId, item.id),
              eq(dealPriceHistory.groupId, groupId),
            ),
          )
          .orderBy(desc(dealPriceHistory.ts))
          .limit(1)
          .get();
        if (
          !latest ||
          latest.price !== groupPriceCents ||
          latest.avail !== isAvailable
        ) {
          tx.insert(dealPriceHistory)
            .values({
              itemId: item.id,
              groupId,
              groupPriceCents,
              isAvailable,
              ts: nowMs,
            })
            .run();
          historyInserts++;
        }
      }
    }

    upsertSyncMetaTx(tx, {
      lastUpstreamUpdated: feed.updated,
      lastSyncAt: nowMs,
      lastSyncOk: 1,
      lastError: null,
      dealCount: totalOffers,
      matchedItemCount: matchedItems,
    });
  });

  return {
    ok: true,
    upstreamUpdated: feed.updated,
    dealCount: totalOffers,
    matchedItemCount: matchedItems,
    matchedDealRows: matchedRows,
    historyInserts,
    durationMs: Date.now() - startMs,
  };
}

/**
 * Delete deal_price_history rows older than the cutoff. Returns deleted row
 * count. Called from the worker's hourly prune sweep.
 */
export function pruneDealHistory(db: DrizzleDb, cutoffMs: number): number {
  const res = db
    .delete(dealPriceHistory)
    .where(sql`${dealPriceHistory.ts} < ${cutoffMs}`)
    .run();
  return typeof (res as { changes?: number }).changes === 'number'
    ? ((res as { changes?: number }).changes as number)
    : 0;
}

// ─── Internals ──────────────────────────────────────────────────────────────

/**
 * Recompute display_name for every existing deal_groups row using the
 * current `KNOWN_GROUP_NAMES` map. Run at the top of every sync — cheap
 * (~20 rows) and means a code-side rename takes effect without waiting
 * for the upstream feed to change.
 */
function healGroupDisplayNames(db: DrizzleDb): void {
  const rows = db
    .select({
      id: dealGroups.id,
      source: dealGroups.source,
      displayName: dealGroups.displayName,
    })
    .from(dealGroups)
    .all();
  for (const row of rows) {
    const expected = displayNameForSource(row.source);
    if (expected !== row.displayName) {
      db.update(dealGroups)
        .set({ displayName: expected })
        .where(eq(dealGroups.id, row.id))
        .run();
    }
  }
}

function ensureGroupsExist(
  db: DrizzleDb,
  sources: Set<string>,
  nowMs: number,
): Map<string, number> {
  if (sources.size === 0) return new Map();
  const sourceArr = Array.from(sources);
  const existing = db
    .select({
      id: dealGroups.id,
      source: dealGroups.source,
      displayName: dealGroups.displayName,
    })
    .from(dealGroups)
    .where(inArray(dealGroups.source, sourceArr))
    .all();
  const map = new Map<string, number>();
  // Self-heal: if our hand-maintained KNOWN_GROUP_NAMES map produces a
  // better label than what's persisted, update the row in place. Cheap —
  // ~20 groups total. Pre-existing rows from before that map gained entries
  // upgrade silently on the next sync.
  for (const row of existing) {
    map.set(row.source, row.id);
    const expected = displayNameForSource(row.source);
    if (expected !== row.displayName) {
      db.update(dealGroups)
        .set({ displayName: expected })
        .where(eq(dealGroups.id, row.id))
        .run();
    }
  }
  for (const source of sourceArr) {
    if (map.has(source)) continue;
    const inserted = db
      .insert(dealGroups)
      .values({
        source,
        displayName: displayNameForSource(source),
        homepageUrl: homepageUrlForSource(source),
        createdAt: nowMs,
      })
      .returning({ id: dealGroups.id })
      .get();
    map.set(source, inserted.id);
  }
  return map;
}

type SyncMetaPatch = {
  lastUpstreamUpdated?: number | null;
  lastSyncAt: number;
  lastSyncOk: number;
  lastError: string | null;
  dealCount?: number | null;
  matchedItemCount?: number | null;
};

function upsertSyncMeta(db: DrizzleDb, patch: SyncMetaPatch) {
  upsertSyncMetaTx(db, patch);
}

// Accept both the top-level db and a transaction handle — drizzle's
// transaction callback hands back a slightly different type that doesn't
// have $client. We only use `.insert(...).onConflictDoUpdate(...)` here.
type AnyDb = {
  insert: DrizzleDb['insert'];
};

function upsertSyncMetaTx(tx: AnyDb, patch: SyncMetaPatch) {
  tx.insert(dealsSync)
    .values({
      id: 1,
      lastUpstreamUpdated: patch.lastUpstreamUpdated ?? null,
      lastSyncAt: patch.lastSyncAt,
      lastSyncOk: patch.lastSyncOk,
      lastError: patch.lastError,
      dealCount: patch.dealCount ?? null,
      matchedItemCount: patch.matchedItemCount ?? null,
    })
    .onConflictDoUpdate({
      target: dealsSync.id,
      set: {
        lastSyncAt: patch.lastSyncAt,
        lastSyncOk: patch.lastSyncOk,
        lastError: patch.lastError,
        ...(patch.lastUpstreamUpdated !== undefined && {
          lastUpstreamUpdated: patch.lastUpstreamUpdated,
        }),
        ...(patch.dealCount !== undefined && { dealCount: patch.dealCount }),
        ...(patch.matchedItemCount !== undefined && {
          matchedItemCount: patch.matchedItemCount,
        }),
      },
    })
    .run();
}
