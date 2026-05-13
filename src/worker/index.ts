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
import { and, asc, eq, isNull, lt, lte, or, sql } from 'drizzle-orm';

import { closeDb, getDb } from '@/lib/db/client';
import { items, stockEvents, workerHeartbeat } from '@/lib/db/schema';
import { fetchProducts, isMissingFromPriceBlocks } from '@/lib/bestbuy';
import { fetchProductsViaPdp } from '@/lib/bestbuy-pdp';
import { applyCheckResult } from '@/lib/checker';
import {
  fetchProductsViaTls,
  needsHeadlessFallback,
} from '@/lib/bestbuy-tls';

const TICK_MS = 1000;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const PRUNE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_BATCH_SIZE = 25;
const WORKER_VERSION = process.env.WORKER_VERSION ?? 'dev';


let shouldStop = false;
let lastPruneAt = 0;
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
  const cutoff = now - PRUNE_RETENTION_MS;
  const res = db.delete(stockEvents).where(lt(stockEvents.ts, cutoff)).run();
  lastPruneAt = now;
  // better-sqlite3 RunResult exposes `changes`; drizzle returns the same shape.
  // We type-narrow via a guarded access.
  const changes =
    typeof (res as { changes?: number }).changes === 'number'
      ? (res as { changes?: number }).changes
      : 0;
  console.log(`[worker] prune: deleted=${changes} stock_events older than 7d`);
}

async function tick(db: ReturnType<typeof getDb>): Promise<void> {
  const tickStart = Date.now();

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

  if (dueItems.length === 0) {
    updateHeartbeat(db, tickStart, 0, 0);
    quietTickCount++;
    if (quietTickCount % 60 === 0) {
      console.log(`[worker] tick: checked=0 errors=0 ms=${Date.now() - tickStart} heartbeat-ok (quiet x${quietTickCount})`);
    }
    return;
  }

  quietTickCount = 0;

  const skus = dueItems.map((i) => i.sku);
  const fetchMap = await fetchProducts(skus);

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
    const tlsMap = await fetchProductsViaTls(tlsFallbackSkus);
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

  // --- Layer 2: PDP proxy scraper (NEC-44) ---
  // For SKUs that the priceBlocks index doesn't carry (newer-catalog items
  // like 6663816) OR that exceeded the TLS 403 budget, fall back to a
  // residential-proxy curl scrape of the product page. Concurrency is
  // managed internally by fetchProductsViaPdp (MAX_CONCURRENT=2).
  const pdpSkus = skus.filter((sku) => {
    const r = fetchMap.get(sku);
    return (
      r && !r.ok && (isMissingFromPriceBlocks(r.error) || needsHeadlessFallback(r.error))
    );
  });
  if (pdpSkus.length > 0) {
    const pdpMap = await fetchProductsViaPdp(pdpSkus);
    for (const [sku, result] of pdpMap) {
      if (result.ok) {
        console.log(`[worker] sku=${sku} fetch_path=pdp_proxy`);
      }
      fetchMap.set(sku, result);
    }
  }

  let errorCount = 0;
  for (const item of dueItems) {
    if (shouldStop) break;
    const result =
      fetchMap.get(item.sku) ??
      ({ ok: false, sku: item.sku, error: 'Missing from batch response' } as const);
    const outcome = await applyCheckResult(item.id, result);
    if (outcome.webhookOk === false || result.ok === false) errorCount++;
  }

  const tickEnd = Date.now();
  updateHeartbeat(db, tickEnd, dueItems.length, errorCount);
  console.log(
    `[worker] tick: checked=${dueItems.length} errors=${errorCount} ms=${tickEnd - tickStart} heartbeat-ok`,
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
      pruneIfDue(db, Date.now());
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

main().catch((err) => {
  console.error('[worker] fatal:', err);
  closeDb();
  process.exit(1);
});
