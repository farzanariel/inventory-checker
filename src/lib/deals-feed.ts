/**
 * Deal-key parsing and BB-SKU extraction for the tbs.dapper.codes feed
 * (SPEC §22).
 *
 * Pure functions — no IO, easy to test.
 */

export type ParsedDealKey = {
  upc?: string;
  model?: string;
  /** Anything we couldn't classify (e.g. `dealandrunner:<uuid>`). */
  raw: string;
};

/**
 * Parse one composite key from `deals.json`. Real-world shapes observed:
 *   upc:850049670302
 *   model:2535001,upc:850049670302
 *   model:MEUX4LW/A
 *   model:X,model:Y,upc:Z   (rare — multi-model)
 *   dealandrunner:<uuid>    (source-specific opaque; no UPC available)
 *
 * Returns `upc`/`model` when present; preserves the original string in `raw`.
 */
export function parseDealKey(key: string): ParsedDealKey {
  const out: ParsedDealKey = { raw: key };
  for (const part of key.split(',')) {
    const idx = part.indexOf(':');
    if (idx < 0) continue;
    const kind = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();
    if (value.length === 0) continue;
    if (kind === 'upc' && !out.upc) out.upc = value;
    else if (kind === 'model' && !out.model) out.model = value;
  }
  return out;
}

/**
 * Extract a Best Buy numeric SKU from any URL string, or null if none.
 *
 * Mirrors `parse-input.parseUrlOrSku` but doesn't require the input to be
 * a BB URL or fail loudly — it just hunts for a SKU substring.
 */
export function extractBestBuySkuFromUrl(url: string): string | null {
  if (typeof url !== 'string' || url.length === 0) return null;
  if (!/bestbuy\.com/i.test(url)) return null;

  const newUrl = url.match(/\/sku\/(\d{6,8})\b/);
  if (newUrl) return newUrl[1];

  const oldP = url.match(/\/(\d{6,8})\.p\b/);
  if (oldP) return oldP[1];

  const skuId = url.match(/[?&]skuId=(\d{6,8})\b/);
  if (skuId) return skuId[1];

  return null;
}

/**
 * Hand-maintained map from upstream `source` string → human display name.
 * Source strings look like `<aggregator>:<domain>` — the *domain* is the
 * actual buying group; the aggregator is just how dapper found it. We want
 * to show the group, not the aggregator (so `sellerspeed:bfmr.com` → "BFMR",
 * never "Sellerspeed"). Anything not in the map falls back to a derived
 * label built from the domain stem (see `displayNameForSource`).
 */
const KNOWN_GROUP_NAMES: Record<string, string> = {
  'bfmr.com': 'BFMR',
  'buyformeretail.com': 'BFMR',
  'buyinggroup.com': 'BuyingGroup',
  'usabuying.group': 'USABuying',
  'maxoutdeals.com': 'MaxOutDeals',
  'earnfrombuying.com': 'EarnFromBuying',
  'buyersforpoints.com': 'BuyersForPoints',
  'makemoneyormiles.com': 'MakeMoneyOrMiles',
  'buygetrewards.com': 'BuyGetRewards',
  'bigdealpoints.com': 'BigDealPoints',
  'ubuywepay.com': 'UBuyWePay',
  'thebuyerzone.com': 'TheBuyerZone',
  'uearnpoints.com': 'UEarnPoints',
  'portal.miamibuyinggroup.com': 'MiamiBuyingGroup',
  'miamibuyinggroup.com': 'MiamiBuyingGroup',
  'points4days.com': 'Points4Days',
  'pointscashback.com': 'PointsCashback',
  'powerbuynetwork.com': 'PowerBuyNetwork',
  'buygetpaid.com': 'BuyGetPaid',
  'mvpbuyinggroup.com': 'MVPBuyingGroup',
  'dealandrunner.com': 'DealAndRunner',
  'buytofill.com': 'BuyToFill',
};

/**
 * Humanize a source slug. Prefers the hand map; falls back to title-casing
 * the domain stem (`sellerspeed:foo-bar.com` → "FooBar"). Used as the
 * default `display_name` for new `deal_groups` rows.
 */
export function displayNameForSource(source: string): string {
  const tail = source.split(':').slice(1).join(':');
  if (tail && KNOWN_GROUP_NAMES[tail]) return KNOWN_GROUP_NAMES[tail];

  // Strip leading subdomains like `portal.` and the TLD; what remains is
  // the group's identifying word.
  const domainStem = tail
    .replace(/^(www|portal|app|m)\./, '')
    .replace(/\.[a-z]{2,}$/i, '');
  if (domainStem) {
    return domainStem
      .split(/[-_.]+/)
      .filter(Boolean)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join('');
  }

  // No domain in source — fall back to the prefix itself.
  const prefix = source.split(':')[0] ?? source;
  return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

/**
 * Homepage URL guess for a source — the second `:`-segment is usually a
 * bare domain (e.g. `bfmr.com`). Returns null if it doesn't look like one.
 */
export function homepageUrlForSource(source: string): string | null {
  const tail = source.split(':').slice(1).join(':');
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(tail)) {
    return `https://${tail}`;
  }
  return null;
}

/**
 * Idempotent helper: recompute the display name for every `deal_groups` row.
 * Called after the worker boots so previously-saved rows pick up updates to
 * `KNOWN_GROUP_NAMES`. Not perf-critical — there are ~20 groups.
 */
export function recomputedDisplayName(source: string): string {
  return displayNameForSource(source);
}

// ─── Feed shape ─────────────────────────────────────────────────────────────

export interface DealsFeedOffer {
  productList?: Array<{
    name?: string;
    image?: string;
    links?: Array<{ url?: string }>;
  }>;
  retailPrice?: number;
  groupPrice?: number;
  isAvailable?: boolean;
  title?: string;
  source?: string;
  url?: string;
}

export interface DealsFeed {
  updated: number;
  deals: Record<string, DealsFeedOffer[]>;
}

/**
 * Walk every offer's productList[].links[] and return any BB SKUs found.
 * Used by the URL-fallback matching pass.
 */
export function bbSkusFromOffer(offer: DealsFeedOffer): string[] {
  const skus: string[] = [];
  for (const p of offer.productList ?? []) {
    for (const link of p.links ?? []) {
      const sku = extractBestBuySkuFromUrl(link.url ?? '');
      if (sku) skus.push(sku);
    }
  }
  return skus;
}
