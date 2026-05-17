/**
 * One-shot UPC backfill (SPEC §22.6).
 *
 * Walks every BB item with NULL upc and fetches productBySkuId.upc via the
 * existing GraphQL pipeline (TLS-impersonating, concurrency-capped). Updates
 * in place. Idempotent — items where BB returns no UPC stay NULL and will
 * just be retried on the next run.
 *
 * Run: `pnpm tsx scripts/backfill-upc.ts`
 */
import { and, eq, isNull } from 'drizzle-orm';

import { closeDb, getDb } from '../src/lib/db/client';
import { items } from '../src/lib/db/schema';
import { fetchProductDetailsViaGraphql } from '../src/lib/bestbuy-graphql';

async function main() {
  const db = getDb();
  const targets = db
    .select({ id: items.id, sku: items.sku })
    .from(items)
    .where(and(eq(items.retailer, 'bestbuy'), isNull(items.upc)))
    .all()
    .filter((r): r is { id: number; sku: string } => typeof r.sku === 'string');

  if (targets.length === 0) {
    console.log('[backfill-upc] nothing to do — all BB items have a UPC');
    closeDb();
    return;
  }

  console.log(`[backfill-upc] fetching UPC for ${targets.length} items...`);
  const skus = targets.map((t) => t.sku);
  const detailsMap = await fetchProductDetailsViaGraphql(skus);

  let updated = 0;
  let stillNull = 0;
  let failed = 0;
  const now = Date.now();
  for (const target of targets) {
    const d = detailsMap.get(target.sku);
    if (!d) {
      failed++;
      continue;
    }
    if (!d.ok) {
      console.warn(`[backfill-upc] sku=${target.sku} graphql_error=${d.error}`);
      failed++;
      continue;
    }
    if (!d.upc) {
      stillNull++;
      continue;
    }
    db.update(items)
      .set({ upc: d.upc, updatedAt: now })
      .where(eq(items.id, target.id))
      .run();
    updated++;
  }

  console.log(
    `[backfill-upc] done — updated=${updated} no_upc=${stillNull} failed=${failed}`,
  );
  closeDb();
}

main().catch((err) => {
  console.error('[backfill-upc] fatal:', err);
  closeDb();
  process.exit(1);
});
