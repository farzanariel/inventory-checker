/**
 * Standalone harness for the headless PDP scraper.
 *
 * Usage:
 *   BB_PROXY="onestopproxies.cc:5557:user:pass" tsx scripts/test-headless.ts 6663816 [more skus...]
 */

import { closePool, scrapePdpForSku } from "../src/lib/bestbuy-headless";

async function main() {
  const skus = process.argv.slice(2);
  if (skus.length === 0) {
    console.error("Usage: tsx scripts/test-headless.ts <sku> [sku...]");
    process.exit(1);
  }
  const proxy = process.env.BB_PROXY;
  for (const sku of skus) {
    const t0 = Date.now();
    const result = await scrapePdpForSku(sku, { proxy, headed: false });
    const dt = Date.now() - t0;
    console.log(`---- SKU ${sku} (${dt}ms) ----`);
    console.log(JSON.stringify(result, null, 2));
  }
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
