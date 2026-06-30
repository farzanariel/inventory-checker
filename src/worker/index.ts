/**
 * Polling worker (SPEC §5, §6, §7.5, §9).
 *
 * Single-threaded loop:
 *   1. Find due items (enabled, next_check_due_at <= now or NULL).
 *   2. Batch-fetch via fetchProducts() — one HTTP request for the whole batch.
 *   3. Apply each ProductResult sequentially via applyCheckResult() — each
 *      call is its own short BEGIN IMMEDIATE transaction (SPEC §7.5).
 *   4. Update worker_heartbeat row (id=1).
 *   5. Hourly: prune stock_events older than 7 days.
 *
 * Orchestration only — all business logic lives in checker.ts.
 */
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { and, eq, gt, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import { pathToFileURL } from 'node:url';

import { closeDb, getDb } from '@/lib/db/client';
import { items, stockEvents, workerHeartbeat } from '@/lib/db/schema';
import { fetchProducts, isMissingFromPriceBlocks, productUrlForSku } from '@/lib/bestbuy';
import { fetchProductsViaPdp } from '@/lib/bestbuy-pdp';
import {
  fetchProductDetailsViaGraphql,
  mergeProductDetailsIntoResult,
} from '@/lib/bestbuy-graphql';
import { applyCheckResult, applyMicroCenterCheckResult } from '@/lib/checker';
import { fetchMicroCenterProduct } from '@/lib/microcenter';
import { pruneDealHistory, syncDeals } from '@/lib/deals-sync';
import {
  fetchProductsViaTls,
  fetchStockViaFulfillment,
  needsHeadlessFallback,
  type FulfillmentItemContext,
} from '@/lib/bestbuy-tls';
import { getSettings } from '@/lib/settings';

const MC_CONCURRENCY = 3;

const TICK_MS = 1000;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const PRUNE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEAL_HISTORY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000; // SPEC §22
const DEALS_SYNC_INTERVAL_MS = 10 * 60 * 1000; // SPEC §22 — every 10 min
const MAX_BATCH_SIZE = 25;
const BATCH_LOOKAHEAD_MS = 10_000;
const WORKER_VERSION = process.env.WORKER_VERSION ?? 'dev';


let shouldStop = false;
let lastPruneAt = 0;
let lastDealsSyncAt = 0;
let quietTickCount = 0;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run `fn` over `items` with at most `concurrency` promises in-flight.
 * Returns results in input order.
 */
async function runConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let i = 0;

  async function worker(): Promise<void> {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

function installSignalHandlers() {
  const onSignal = (sig: string) => {
    if (shouldStop) return;
    console.log(`[worker] shutdown signal received (${sig}), exiting after current tick`);
    shouldStop = true;
  };
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));
}

function ensureHeartbeatRow(db: ReturnType<typeof getDb>, now: number) {
  db.insert(workerHeartbeat)
    .values({
      id: 1,
      lastTickAt: now,
      itemsCheckedLast: 0,
      errorsLast: 0,
      workerVersion: WORKER_VERSION,
    })
    .onConflictDoNothing()
    .run();
}

function updateHeartbeat(
  db: ReturnType<typeof getDb>,
  now: number,
  checked: number,
  errors: number,
) {
  db.insert(workerHeartbeat)
    .values({
      id: 1,
      lastTickAt: now,
      itemsCheckedLast: checked,
      errorsLast: errors,
      workerVersion: WORKER_VERSION,
    })
    .onConflictDoUpdate({
      target: workerHeartbeat.id,
      set: {
        lastTickAt: now,
        itemsCheckedLast: checked,
        errorsLast: errors,
        workerVersion: WORKER_VERSION,
      },
    })
    .run();
}

function pruneIfDue(db: ReturnType<typeof getDb>, now: number) {
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) return;
  const stockCutoff = now - PRUNE_RETENTION_MS;
  const stockRes = db
    .delete(stockEvents)
    .where(lt(stockEvents.ts, stockCutoff))
    .run();
  const dealHistoryDeleted = pruneDealHistory(db, now - DEAL_HISTORY_RETENTION_MS);
  lastPruneAt = now;
  const stockChanges =
    typeof (stockRes as { changes?: number }).changes === 'number'
      ? (stockRes as { changes?: number }).changes
      : 0;
  console.log(
    `[worker] prune: deleted=${stockChanges} stock_events older than 7d, ${dealHistoryDeleted} deal_price_history older than 90d`,
  );
}

async function syncDealsIfDue(db: ReturnType<typeof getDb>, now: number) {
  if (now - lastDealsSyncAt < DEALS_SYNC_INTERVAL_MS) return;
  lastDealsSyncAt = now;
  try {
    const outcome = await syncDeals(db);
    if (outcome.skipped === 'unchanged') {
      console.log(`[worker] deals-sync: unchanged (upstream updated=${outcome.upstreamUpdated})`);
    } else if (outcome.ok) {
      console.log(
        `[worker] deals-sync: ok deals=${outcome.dealCount} matched_items=${outcome.matchedItemCount} rows=${outcome.matchedDealRows} history+=${outcome.historyInserts} ms=${outcome.durationMs}`,
      );
    } else {
      console.warn(`[worker] deals-sync: failed error=${outcome.error}`);
    }
  } catch (err) {
    // Don't let a buggy sync take down the polling loop.
    console.error('[worker] deals-sync threw:', err);
  }
}

export function selectItemsForTick(db: ReturnType<typeof getDb>, tickStart: number) {
  const dueItems = db
    .select()
    .from(items)
    .where(
      and(
        eq(items.enabled, 1),
        or(isNull(items.nextCheckDueAt), lte(items.nextCheckDueAt, tickStart)),
      ),
    )
    // ASC NULLS FIRST — SQLite default for ASC is NULLS FIRST, but be explicit.
    .orderBy(sql`${items.nextCheckDueAt} ASC NULLS FIRST`)
    .limit(MAX_BATCH_SIZE)
    .all();

  if (dueItems.length === 0 || dueItems.length >= MAX_BATCH_SIZE) {
    return dueItems;
  }

  const dueBestBuyIntervals = Array.from(
    new Set(
      dueItems
        .filter((item) => item.retailer !== 'microcenter' && item.sku != null)
        .map((item) => item.checkIntervalMin),
    ),
  );

  if (dueBestBuyIntervals.length === 0) {
    return dueItems;
  }

  const lookaheadItems = db
    .select()
    .from(items)
    .where(
      and(
        eq(items.enabled, 1),
        ne(items.retailer, 'microcenter'),
        isNotNull(items.sku),
        inArray(items.checkIntervalMin, dueBestBuyIntervals),
        gt(items.nextCheckDueAt, tickStart),
        lte(items.nextCheckDueAt, tickStart + BATCH_LOOKAHEAD_MS),
      ),
    )
    .orderBy(sql`${items.nextCheckDueAt} ASC`)
    .limit(MAX_BATCH_SIZE - dueItems.length)
    .all();

  return [...dueItems, ...lookaheadItems];
}

export async function tick(db: ReturnType<typeof getDb>): Promise<void> {
  const tickStart = Date.now();
  const dueItems = selectItemsForTick(db, tickStart);

  if (dueItems.length === 0) {
    updateHeartbeat(db, tickStart, 0, 0);
    quietTickCount++;
    if (quietTickCount % 60 === 0) {
      console.log(`[worker] tick: checked=0 errors=0 ms=${Date.now() - tickStart} heartbeat-ok (quiet x${quietTickCount})`);
    }
    return;
  }

  quietTickCount = 0;

  // Split by retailer. BB items use the 3-tier batched fetch; MC items
  // are fetched individually via the headless pool.
  const bbItems = dueItems.filter((i) => i.retailer !== 'microcenter' && i.sku != null);
  const mcItems = dueItems.filter((i) => i.retailer === 'microcenter' && i.mcProductId != null);
  const lookaheadCount = dueItems.filter(
    (item) => item.nextCheckDueAt != null && item.nextCheckDueAt > tickStart,
  ).length;
  let bbFetchMs = 0;
  let tlsFallbackMs = 0;
  let fulfillmentMs = 0;
  let graphqlMs = 0;
  let pdpMs = 0;
  let applyMs = 0;
  let mcMs = 0;

  const skus = bbItems.map((i) => i.sku as string);
  const bbFetchStart = Date.now();
  const fetchMap = skus.length > 0 ? await fetchProducts(skus) : new Map();
  bbFetchMs = Date.now() - bbFetchStart;

  // --- Layer 1: TLS-impersonating HTTP client ---
  // For SKUs that failed via undici (non-missing errors like 403/timeout),
  // retry using the curl-impersonate wrapper which presents a Chrome 116
  // JA3 fingerprint and full header set. This bypasses Akamai's TLS-level
  // blocking without running a full browser.
  const tlsFallbackSkus = skus.filter((sku) => {
    const r = fetchMap.get(sku);
    return (
      r &&
      !r.ok &&
      !isMissingFromPriceBlocks(r.error) &&
      !needsHeadlessFallback(r.error)
    );
  });
  if (tlsFallbackSkus.length > 0) {
    const tlsStart = Date.now();
    const tlsMap = await fetchProductsViaTls(tlsFallbackSkus);
    tlsFallbackMs = Date.now() - tlsStart;
    for (const [sku, result] of tlsMap) {
      if (result.ok) {
        console.log(`[worker] sku=${sku} fetch_path=tls`);
        fetchMap.set(sku, result);
      } else if (needsHeadlessFallback(result.error)) {
        // Keep the original error in fetchMap — headless will pick it up below.
      } else {
        // TLS failed with a non-403 error — keep the original undici error.
      }
    }
  }

  // --- Layer 1.5: Fulfillment GraphQL stock fallback (SPEC §6.7) ---
  // For SKUs that priceBlocks can't resolve (J-code product-family items),
  // hit /gateway/graphql/fulfillment via the same warmed curl_chrome116
  // client. Returns buttonState only; successful stock results are then
  // enriched by the GraphQL-over-GET metadata path before DB writes.
  // SKUs that fail here remain in PENDING_REINDEX exactly as before.
  const fulfillmentSkus = skus.filter((sku) => {
    const r = fetchMap.get(sku);
    return r && !r.ok && isMissingFromPriceBlocks(r.error);
  });
  if (fulfillmentSkus.length > 0) {
    const fulfillmentStart = Date.now();
    const itemBySku = new Map<string, FulfillmentItemContext>();
    for (const item of bbItems) {
      const sku = item.sku as string;
      if (!fulfillmentSkus.includes(sku)) continue;
      itemBySku.set(sku, {
        name: item.name ?? `SKU ${sku}`,
        brand: item.brand ?? null,
        currentPriceCents: item.currentPriceCents,
        regularPriceCents: item.regularPriceCents,
        productUrl: item.productUrl ?? productUrlForSku(sku),
      });
    }
    const fulfillmentMap = await fetchStockViaFulfillment(fulfillmentSkus, itemBySku);
    const needsMetadataSkus: string[] = [];
    for (const [sku, result] of fulfillmentMap) {
      if (result.ok) {
        needsMetadataSkus.push(sku);
        console.log(`[worker] sku=${sku} fetch_path=fulfillment`);
        fetchMap.set(sku, result);
      }
      // On failure, leave the original ProductNotFoundException error in fetchMap
      // so the item stays in PENDING_REINDEX exactly as before (no regression).
    }
    fulfillmentMs = Date.now() - fulfillmentStart;

    if (needsMetadataSkus.length > 0) {
      const graphqlStart = Date.now();
      const detailsMap = await fetchProductDetailsViaGraphql(needsMetadataSkus);
      graphqlMs = Date.now() - graphqlStart;
      for (const sku of needsMetadataSkus) {
        const stockResult = fetchMap.get(sku);
        const merged = stockResult
          ? mergeProductDetailsIntoResult(stockResult, detailsMap.get(sku))
          : stockResult;
        if (merged?.ok) {
          console.log(`[worker] sku=${sku} fetch_path=fulfillment+graphql`);
          fetchMap.set(sku, merged);
        } else {
          const detailResult = detailsMap.get(sku);
          if (detailResult && !detailResult.ok) {
            console.warn(`[worker] sku=${sku} graphql_metadata_failed=${detailResult.error}`);
          }
        }
      }
    }
  }

  // --- Layer 2: PDP proxy scraper (NEC-44) ---
  // Only used when Layer 1 returned a 403-budget-exceeded error
  // (`needsHeadlessFallback`). J-code SKUs are handled by Layer 1.5 above.
  const pdpSkus = skus.filter((sku) => {
    const r = fetchMap.get(sku);
    return r && !r.ok && needsHeadlessFallback(r.error);
  });
  if (pdpSkus.length > 0) {
    const pdpStart = Date.now();
    const pdpMap = await fetchProductsViaPdp(pdpSkus);
    pdpMs = Date.now() - pdpStart;
    for (const [sku, result] of pdpMap) {
      if (result.ok) {
        console.log(`[worker] sku=${sku} fetch_path=pdp_proxy`);
      }
      fetchMap.set(sku, result);
    }
  }

  let errorCount = 0;
  const settings = getSettings(db);
  // BB path: apply each result sequentially (each is its own short txn).
  const applyStart = Date.now();
  for (const item of bbItems) {
    if (shouldStop) break;
    const sku = item.sku as string;
    const result =
      fetchMap.get(sku) ??
      ({ ok: false, sku, error: 'Missing from batch response' } as const);
    const outcome = await applyCheckResult(item.id, result, {
      webhookUrl: settings.discordWebhookUrl,
      webhookUsername: settings.discordUsername,
    });
    if (outcome.webhookOk === false || result.ok === false) errorCount++;
  }
  applyMs = Date.now() - applyStart;

  // MC path: fetch + apply per item, capped concurrency.
  if (mcItems.length > 0 && !shouldStop) {
    const mcStart = Date.now();
    const outcomes = await runConcurrent(mcItems, MC_CONCURRENCY, async (item) => {
      if (shouldStop) return null;
      const result = await fetchMicroCenterProduct(item.mcProductId as string);
      return applyMicroCenterCheckResult(item.id, result, {
        webhookUrl: settings.discordWebhookUrl,
        webhookUsername: settings.discordUsername,
      });
    });
    for (const outcome of outcomes) {
      if (outcome && (outcome.webhookOk === false || outcome.notification === null && outcome.reason.startsWith('MC error'))) {
        errorCount++;
      }
    }
    mcMs = Date.now() - mcStart;
  }

  const tickEnd = Date.now();
  updateHeartbeat(db, tickEnd, dueItems.length, errorCount);
  console.log(
    `[worker] tick: checked=${dueItems.length} bb=${bbItems.length} mc=${mcItems.length} lookahead=${lookaheadCount} errors=${errorCount} ms=${tickEnd - tickStart} phases=bb:${bbFetchMs},tls:${tlsFallbackMs},fulfillment:${fulfillmentMs},graphql:${graphqlMs},pdp:${pdpMs},apply:${applyMs},mc:${mcMs} heartbeat-ok`,
  );
}

async function main(): Promise<void> {
  installSignalHandlers();

  const db = getDb();

  // Apply migrations on startup so a fresh VPS bootstraps cleanly.
  migrate(db, { migrationsFolder: './drizzle' });

  console.log(`[worker] inventory-checker worker starting | version=${WORKER_VERSION}`);

  ensureHeartbeatRow(db, Date.now());

  while (!shouldStop) {
    try {
      await tick(db);
      const nowMs = Date.now();
      pruneIfDue(db, nowMs);
      await syncDealsIfDue(db, nowMs);
    } catch (err) {
      console.error('[worker] error:', err);
    }
    if (shouldStop) break;
    await sleep(TICK_MS);
  }

  console.log('[worker] loop exited, closing db');
  closeDb();
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('[worker] fatal:', err);
    closeDb();
    process.exit(1);
  });
}
