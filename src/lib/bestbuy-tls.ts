/**
 * TLS-impersonating HTTP client for Best Buy's priceBlocks endpoint.
 *
 * Wraps curl-impersonate (curl_chrome116) as a child process so every
 * request presents a Chrome 116 JA3 fingerprint and full header set.
 * Akamai's JS challenge is NOT required for priceBlocks (confirmed per
 * NEC-26 spike), so a well-fingerprinted TLS client plus warmed session
 * cookies bypasses the block without rendering JS.
 *
 * ## Session warming
 *
 * Before any priceBlocks call, we hit https://www.bestbuy.com/ to receive
 * Akamai-specific cookies (_abck, bm_sz, ak_bmsc) and BestBuy session
 * cookies. These are persisted to a Netscape-format cookie jar on disk
 * and reused across requests. The jar is refreshed every ~25 min.
 *
 * ## Error budget
 *
 * Each SKU gets N consecutive 403s before we mark it as needing the
 * stealth-browser path (sibling issue A). A single success resets the
 * counter.
 *
 * ## Concurrency
 *
 * At most 2 concurrent priceBlocks calls (jittered internally).
 */

import { execFile as _execFile } from "node:child_process";
import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import type { ProductResult } from "./bestbuy";
import { extractPriceBlocksExtras } from "./bestbuy";
import { interpretStock } from "./bestbuy";

/**
 * Promise wrapper around execFile that always resolves to {stdout, stderr}.
 * Avoids Node's util.promisify because it uses customPromisifyArgs internally,
 * which breaks when the function target doesn't carry that symbol (e.g. mocked).
 */
function execFileAsync(
  file: string,
  args: string[],
  opts: { timeout?: number; maxBuffer?: number },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    _execFile(file, args, opts, (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve({ stdout: stdout ?? "", stderr: stderr ?? "" });
    });
  });
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CURL_BIN = "/usr/local/bin/curl_chrome116";

// True when curl-impersonate isn't installed AND we're not under a unit-test
// runner (vitest mocks execFile directly, so we must NOT short-circuit there).
const USE_PLAIN_FETCH_FALLBACK =
  !process.env.VITEST && !existsSync(CURL_BIN);
const COOKIE_DIR = path.resolve(process.cwd(), "data", "cookies");
const COOKIE_FILE = path.join(COOKIE_DIR, "bestbuy-cookies.txt");

/** Session cookies from Best Buy + Akamai last ~30 min. Refresh at 25. */
const JAR_REFRESH_INTERVAL_MS = 25 * 60 * 1000;

/** How many consecutive 403s before we hand off a SKU to the headless path. */
const SKU_403_BUDGET = 3;

/**
 * Max concurrent priceBlocks calls. BB's priceBlocks endpoint handles a
 * batch of SKUs in one request, so this is really a limit on parallel
 * *batches* (rare — normally the worker sends one batch per tick).
 */
const MAX_CONCURRENT = 2;

const BESTBUY_ORIGIN = "https://www.bestbuy.com";
const PRICE_BLOCKS_PATH = "/api/3.0/priceBlocks";

const JITTER = () => 0.7 + Math.random() * 0.6; // ±30%

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

/**
 * Full Chrome 116 desktop header set, matching what a real browser sends
 * to bestbuy.com. Missing or mismatched Sec-CH-UA / Sec-Fetch-* headers
 * are a common Akamai trigger even with a correct JA3 fingerprint.
 */
const CHROME_HEADERS: string[] = [
  "Accept: application/json",
  "Accept-Language: en-US,en;q=0.9",
  "Accept-Encoding: gzip, deflate, br",
  'Sec-CH-UA: "Not/A)Brand";v="99", "Google Chrome";v="116", "Chromium";v="116"',
  "Sec-CH-UA-Mobile: ?0",
  'Sec-CH-UA-Platform: "macOS"',
  "Sec-Fetch-Dest: empty",
  "Sec-Fetch-Mode: cors",
  "Sec-Fetch-Site: same-origin",
  "Referer: https://www.bestbuy.com/",
  "Origin: https://www.bestbuy.com",
  "Connection: keep-alive",
  "DNT: 1",
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let concurrentFetches = 0;

/** Timestamp of last successful warm-up. */
let lastWarmedAt = 0;

/** In-flight warming promise — dedup so concurrent warm calls coalesce. */
let warmingPromise: Promise<string> | null = null;

/** Cached cookie file path after a successful warm. */
let warmedCookies: string | null = null;

/** Per-SKU consecutive 403 count. */
const sku403Counts = new Map<string, number>();

// ---------------------------------------------------------------------------
// Cookie jar management
// ---------------------------------------------------------------------------

async function ensureCookieDir(): Promise<void> {
  await fs.mkdir(COOKIE_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// Session warming
// ---------------------------------------------------------------------------

/**
 * Warm the session by hitting https://www.bestbuy.com/ and persisting the
 * resulting cookie jar. Akamai sets _abck/bm_sz/ak_bmsc on this initial
 * page load, which are then required for subsequent API calls.
 *
 * Returns the cookie file path (ensures warm cookies are available).
 * Multiple concurrent callers coalesce into a single warming attempt.
 */
export async function warmSession(): Promise<string> {
  // Dev fallback: skip warming when curl-impersonate isn't installed —
  // plain fetch in curlFetch() doesn't use the cookie jar.
  if (USE_PLAIN_FETCH_FALLBACK) return COOKIE_FILE;

  // Return cached warm cookies if still fresh
  if (warmedCookies && Date.now() - lastWarmedAt < JAR_REFRESH_INTERVAL_MS) {
    return warmedCookies;
  }

  if (warmingPromise) {
    return warmingPromise;
  }

  warmingPromise = (async (): Promise<string> => {
    await ensureCookieDir();

    const args: string[] = [
      "-s",
      "-L",                     // follow redirects
      "-o", "/dev/null",        // discard page body
      "--cookie-jar", COOKIE_FILE,
      "--cookie", COOKIE_FILE,  // send existing cookies if any
      BESTBUY_ORIGIN,
    ];

    try {
      await execFileAsync(CURL_BIN, args, { timeout: 15_000 });
      lastWarmedAt = Date.now();
      warmedCookies = COOKIE_FILE;
    } catch (err) {
      console.warn(`[bestbuy-tls] session warm failed: ${err instanceof Error ? err.message : String(err)}`);
      if (warmedCookies) return warmedCookies;
      throw new Error(`session warm failed and no fallback cookies: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      warmingPromise = null;
    }

    return COOKIE_FILE;
  })();

  return warmingPromise;
}

// ---------------------------------------------------------------------------
// curl-impersonate wrapper
// ---------------------------------------------------------------------------

interface CurlResult {
  stdout: string;
  stderr: string;
  statusCode: number;
}

/**
 * Execute a curl-impersonate request and return parsed response.
 *
 * @param url       Full URL to fetch
 * @param cookieJar Path to Netscape-format cookie file
 * @param timeoutMs Request timeout
 * @param extraArgs Additional curl arguments
 */
async function curlFetch(
  url: string,
  cookieJar: string,
  timeoutMs = 15_000,
  extraArgs: string[] = [],
): Promise<CurlResult> {
  // Dev fallback: plain Node fetch when curl-impersonate isn't installed.
  // BB endpoints accept it from a residential IP; on the VPS the binary
  // exists and this branch is skipped.
  if (USE_PLAIN_FETCH_FALLBACK) {
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    };
    for (const h of CHROME_HEADERS) {
      const idx = h.indexOf(":");
      if (idx > 0) headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
    }
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { stdout: await res.text(), stderr: "", statusCode: res.status };
  }

  // Each header must be a separate -H flag; flatMap produces ["-H", "Accept: …", "-H", "Accept-Language: …", …]
  const headerArgs = CHROME_HEADERS.flatMap((h) => ["-H", h]);

  // \n before %{http_code} guarantees the status code is on its own line
  // even when the response body has no trailing newline (compact JSON).
  const args: string[] = [
    "-s",
    "-o", "-",
    "-w", "\n%{http_code}",
    "--cookie-jar", cookieJar,
    "--cookie", cookieJar,
    ...headerArgs,
    ...extraArgs,
    "--compressed",
    url,
  ];

  const { stdout, stderr } = await execFileAsync(CURL_BIN, args, {
    timeout: timeoutMs,
    maxBuffer: 2 * 1024 * 1024, // 2MB
  });

  // The last line is always the status code (we injected \n before %{http_code}).
  const lastNl = stdout.lastIndexOf("\n");
  const statusCode = parseInt(stdout.slice(lastNl + 1).trim(), 10);
  const body = stdout.slice(0, lastNl);

  return { stdout: body, stderr, statusCode };
}

/**
 * GET a JSON URL via the TLS-impersonating client, warming the session jar
 * first. Returned shape mirrors curlFetch; caller parses the body. Used by
 * non-priceBlocks JSON endpoints (e.g. /api/v2/product/{sku}) that also sit
 * behind Akamai's TLS fingerprinting.
 */
export async function tlsJsonGet(
  url: string,
  timeoutMs = 12_000,
): Promise<{ body: string; statusCode: number }> {
  const cookieJar = await warmSession();
  const r = await curlFetch(url, cookieJar, timeoutMs);
  return { body: r.stdout, statusCode: r.statusCode };
}

// ---------------------------------------------------------------------------
// PriceBlocks via TLS client
// ---------------------------------------------------------------------------

/**
 * Batch-fetch Best Buy priceBlocks via the TLS-impersonating client.
 *
 * Signature matches `fetchProducts` in bestbuy.ts so the worker can use them
 * interchangeably within a unified pipeline.
 */
export async function fetchProductsViaTls(
  skus: string[],
): Promise<Map<string, ProductResult>> {
  const results = new Map<string, ProductResult>();

  if (skus.length === 0) return results;

  // Acquire concurrency slot
  while (concurrentFetches >= MAX_CONCURRENT) {
    await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));
  }
  concurrentFetches++;

  try {
    // Warm session if needed (deduped internally)
    let cookieJar: string;
    try {
      cookieJar = await warmSession();
    } catch {
      for (const sku of skus) {
        results.set(sku, { ok: false, sku, error: "Session warm failed" });
      }
      return results;
    }

    // Jitter before firing
    await new Promise((r) => setTimeout(r, Math.round(500 * JITTER())));

    const url = `${BESTBUY_ORIGIN}${PRICE_BLOCKS_PATH}?skus=${skus.join(",")}`;

    let curlResult: CurlResult;

    try {
      curlResult = await curlFetch(url, cookieJar, 12_000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "TLS fetch error";
      for (const sku of skus) {
        results.set(sku, { ok: false, sku, error: `tls: ${message}` });
      }
      return results;
    }

    const { stdout: body, statusCode } = curlResult;

    // --- 403 handling: per-SKU error budget ---
    if (statusCode === 403) {
      for (const sku of skus) {
        const current = (sku403Counts.get(sku) ?? 0) + 1;
        sku403Counts.set(sku, current);
        results.set(sku, {
          ok: false,
          sku,
          error: current >= SKU_403_BUDGET
            ? `tls: 403 x${current} — exceeds budget, needs headless`
            : `tls: 403 (attempt ${current}/${SKU_403_BUDGET})`,
        });
      }
      return results;
    }

    if (statusCode !== 200) {
      for (const sku of skus) {
        results.set(sku, { ok: false, sku, error: `tls: HTTP ${statusCode}` });
      }
      return results;
    }

    // --- Parse JSON response ---
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      for (const sku of skus) {
        results.set(sku, { ok: false, sku, error: "tls: invalid JSON response" });
      }
      return results;
    }

    if (!Array.isArray(payload)) {
      for (const sku of skus) {
        results.set(sku, { ok: false, sku, error: "tls: unexpected response shape" });
      }
      return results;
    }

    // --- Parse entries (same logic as bestbuy.ts's fetchProducts) ---
    interface RawSkuEntry {
      sku?: {
        skuId?: string;
        error?: string;
        brand?: { brand?: string };
        buttonState?: { buttonState?: string; purchasable?: boolean; skuId?: string };
        names?: { short?: string };
        price?: {
          currentPrice?: number;
          regularPrice?: number;
          priceDomain?: { saleEndDate?: string };
        };
        url?: string;
        condition?: string;
        sellerInfo?: { seller?: string; sellerId?: string };
      };
    }

    const entries = payload as RawSkuEntry[];

    for (const entry of entries) {
      const skuObj = entry?.sku;
      const skuId = skuObj?.skuId;

      if (!skuObj || !skuId) continue;

      // Success resets the 403 budget for this SKU
      sku403Counts.set(skuId, 0);

      if (typeof skuObj.error === "string" && skuObj.error.length > 0) {
        results.set(skuId, {
          ok: false,
          sku: skuId,
          error: summarizeTlsError(skuObj.error),
        });
        continue;
      }

      const buttonState = skuObj.buttonState?.buttonState;
      // Best Buy omits `purchasable` for sold-out SKUs — treat absence as false.
      const purchasable = skuObj.buttonState?.purchasable ?? false;
      const name = skuObj.names?.short;
      const currentPrice = skuObj.price?.currentPrice;

      if (
        typeof buttonState !== "string" ||
        typeof name !== "string" ||
        typeof currentPrice !== "number" ||
        typeof purchasable !== "boolean"
      ) {
        results.set(skuId, {
          ok: false,
          sku: skuId,
          error: "Invalid SKU or missing fields",
        });
        continue;
      }

      const regularPrice = skuObj.price?.regularPrice;
      const brand = skuObj.brand?.brand;
      const relativeUrl = skuObj.url;
      const canonicalUrl =
        typeof relativeUrl === "string" && relativeUrl.length > 0
          ? `${BESTBUY_ORIGIN}${relativeUrl}`
          : `https://www.bestbuy.com/site/-/${skuId}.p?skuId=${skuId}`;

      const result: ProductResult = {
        ok: true,
        sku: skuId,
        name,
        currentPriceCents: Math.round(currentPrice * 100),
        buttonState,
        purchasable,
        canonicalUrl,
      };

      if (typeof brand === "string" && brand.length > 0) {
        result.brand = brand;
      }
      if (typeof regularPrice === "number") {
        result.regularPriceCents = Math.round(regularPrice * 100);
      }

      Object.assign(result, extractPriceBlocksExtras(skuObj));

      results.set(skuId, result);
    }

    // Fill missing SKUs
    for (const sku of skus) {
      if (!results.has(sku)) {
        results.set(sku, { ok: false, sku, error: "Not found in response" });
      }
    }

    return results;
  } finally {
    concurrentFetches--;
  }
}

// ---------------------------------------------------------------------------
// Layer 1.5: Fulfillment GraphQL stock fallback (J-code SKUs)
// ---------------------------------------------------------------------------

const FULFILLMENT_PATH = "/gateway/graphql/fulfillment";
const DEFAULT_FULFILLMENT_ZIP = "10001";

/** Item fields stitched into the ProductResult when only stock is fetched. */
export interface FulfillmentItemContext {
  name: string;
  brand: string | null;
  currentPriceCents: number | null;
  regularPriceCents: number | null;
  productUrl: string;
}

/**
 * Fetch stock signal (buttonState) for SKUs that priceBlocks doesn't index
 * (J-code product-family items). Uses the same warmed curl_chrome116 client
 * as priceBlocks. One request per SKU (the fulfillment endpoint is not
 * batched).
 *
 * Returns a ProductResult per SKU; price/name/image are stitched from the
 * provided `itemBySku` context — we deliberately do NOT trust the response
 * for those fields (this path is stock-only per SPEC §6.7).
 */
export async function fetchStockViaFulfillment(
  skus: string[],
  itemBySku: Map<string, FulfillmentItemContext>,
): Promise<Map<string, ProductResult>> {
  const results = new Map<string, ProductResult>();
  if (skus.length === 0) return results;

  const zip = process.env.BESTBUY_FULFILLMENT_ZIP ?? DEFAULT_FULFILLMENT_ZIP;

  let cookieJar: string;
  try {
    cookieJar = await warmSession();
  } catch {
    for (const sku of skus) {
      results.set(sku, { ok: false, sku, error: "fulfillment: session warm failed" });
    }
    return results;
  }

  // Process SKUs with a concurrency cap matching the priceBlocks path.
  let index = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = index++;
      if (i >= skus.length) return;
      const sku = skus[i];
      // Jitter so concurrent slots don't start in lockstep.
      await new Promise((r) => setTimeout(r, Math.round(120 * JITTER())));
      results.set(sku, await fetchOneFulfillment(sku, cookieJar, zip, itemBySku.get(sku)));
    }
  }

  const workerCount = Math.min(MAX_CONCURRENT, skus.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

async function fetchOneFulfillment(
  sku: string,
  cookieJar: string,
  zip: string,
  ctx: FulfillmentItemContext | undefined,
): Promise<ProductResult> {
  const variables = JSON.stringify({
    fulfillmentOptionsInput: { sku, shipping: { destinationZipCode: zip } },
  });
  const url = `${BESTBUY_ORIGIN}${FULFILLMENT_PATH}?variables=${encodeURIComponent(variables)}`;

  let curlResult: CurlResult;
  try {
    curlResult = await curlFetch(url, cookieJar, 12_000);
  } catch (err) {
    const message = err instanceof Error ? err.message : "TLS fetch error";
    return { ok: false, sku, error: `fulfillment: ${message}` };
  }

  const { stdout: body, statusCode } = curlResult;
  if (statusCode !== 200) {
    return { ok: false, sku, error: `fulfillment: HTTP ${statusCode}` };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return { ok: false, sku, error: "fulfillment: invalid JSON response" };
  }

  const buttonState = extractFulfillmentButtonState(payload, sku);
  if (!buttonState) {
    return { ok: false, sku, error: "fulfillment: missing buttonState" };
  }

  if (!ctx) {
    return { ok: false, sku, error: "fulfillment: no item context for stitching" };
  }

  const result: ProductResult = {
    ok: true,
    sku,
    name: ctx.name,
    currentPriceCents: ctx.currentPriceCents ?? 0,
    buttonState,
    purchasable: interpretStock(buttonState) === "IN_STOCK",
    canonicalUrl: ctx.productUrl,
  };
  if (ctx.brand) result.brand = ctx.brand;
  if (ctx.regularPriceCents != null) result.regularPriceCents = ctx.regularPriceCents;
  return result;
}

interface FulfillmentResponse {
  data?: {
    fulfillmentOptions?: {
      buttonStates?: Array<{ buttonState?: string; skuId?: string }>;
    };
  };
}

function extractFulfillmentButtonState(payload: unknown, sku: string): string | null {
  const fulfillment = (payload as FulfillmentResponse)?.data?.fulfillmentOptions;
  const buttonStates = fulfillment?.buttonStates;
  if (!Array.isArray(buttonStates) || buttonStates.length === 0) return null;
  // Prefer the entry matching the requested SKU; fall back to the first one.
  const match = buttonStates.find((b) => b?.skuId === sku) ?? buttonStates[0];
  const state = match?.buttonState;
  return typeof state === "string" && state.length > 0 ? state : null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function summarizeTlsError(raw: string): string {
  if (/ProductNotFoundException|product not found/i.test(raw)) {
    return "Best Buy's price API doesn't recognize this SKU (TLS path)";
  }
  const statusMatch = raw.match(/status:\s*(\d{3})/i);
  if (statusMatch) {
    return `Best Buy returned HTTP ${statusMatch[1]} for this SKU (TLS path)`;
  }
  const trimmed = raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
  return `Best Buy (TLS): ${trimmed}`;
}

/**
 * Check whether a given "tls: 403" error indicates the SKU has exceeded
 * its error budget and should fall back to the headless/stealth path.
 */
export function needsHeadlessFallback(error: string): boolean {
  return /needs headless/i.test(error);
}

/**
 * Reset the per-SKU 403 budget for a set of SKUs (e.g., after a
 * successful headless scrape).
 */
export function reset403Budget(skus: string[]): void {
  for (const sku of skus) {
    sku403Counts.delete(sku);
  }
}

/**
 * Exposed for testing / diagnostics.
 */
export function getSku403Count(sku: string): number {
  return sku403Counts.get(sku) ?? 0;
}

/**
 * Reset all module-level session state. Test use only.
 */
export function _resetWarmStateForTest(): void {
  lastWarmedAt = 0;
  warmingPromise = null;
  warmedCookies = null;
  concurrentFetches = 0;
}

/**
 * Reset ALL module-level state. Only needed in tests.
 */
export function resetTlsState(): void {
  sku403Counts.clear();
  warmingPromise = null;
  warmedCookies = null;
  lastWarmedAt = 0;
  concurrentFetches = 0;
}
