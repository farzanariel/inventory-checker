/**
 * Best Buy stock detection — pure HTTP, no DB.
 *
 * Per SPEC §6: hits the priceBlocks endpoint with browser-like headers
 * (curl is rejected at the TLS-fingerprint layer). Returns one ProductResult
 * per requested SKU, keyed by SKU string.
 */

export type ProductResult =
  | {
      ok: true;
      sku: string;
      name: string;
      brand?: string;
      currentPriceCents: number;
      regularPriceCents?: number;
      imageUrl?: string;
      buttonState: string;
      purchasable: boolean;
      canonicalUrl: string;
    }
  | { ok: false; sku: string; error: string };

export type StockStatus = "IN_STOCK" | "OUT_OF_STOCK" | "UNKNOWN";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const BESTBUY_ORIGIN = "https://www.bestbuy.com";

/**
 * Map a raw `buttonState` string to our coarse stock status (SPEC §6.4).
 * `purchasable` is intentionally NOT consulted — `buttonState` is the source of truth.
 */
export function interpretStock(buttonState: string | undefined | null): StockStatus {
  if (buttonState === undefined || buttonState === null || buttonState === "") {
    return "UNKNOWN";
  }

  switch (buttonState) {
    case "ADD_TO_CART":
    case "LOW_STOCK":
    case "IN_CART":
      return "IN_STOCK";
    case "CHECK_STORES":
    case "SOLD_OUT_ONLINE":
    case "SOLD_OUT":
    case "COMING_SOON":
    case "PRE_ORDER":
      return "OUT_OF_STOCK";
    default:
      return "UNKNOWN";
  }
}

/**
 * Deterministic image CDN URL (verified 200 OK in spike).
 * For SKUs <4 digits, use the whole SKU as the prefix (defensive — should not happen
 * with parseUrlOrSku, but caller might pass anything).
 */
export function imageUrlForSku(sku: string): string {
  const prefix = sku.length >= 4 ? sku.slice(0, 4) : sku;
  return `https://pisces.bbystatic.com/image2/BestBuy_US/images/products/${prefix}/${sku}_sd.jpg`;
}

export function cartUrlForSku(sku: string): string {
  return `${BESTBUY_ORIGIN}/cart?skuId=${sku}`;
}

/**
 * Canonical product URL fallback when the API doesn't echo `sku.url`.
 * Best Buy accepts a placeholder slug ("-") and redirects to the real product page.
 */
export function productUrlForSku(sku: string): string {
  return `${BESTBUY_ORIGIN}/site/-/${sku}.p?skuId=${sku}`;
}

interface RawSkuEntry {
  sku?: {
    skuId?: string;
    error?: string;
    brand?: { brand?: string };
    buttonState?: { buttonState?: string; purchasable?: boolean; skuId?: string };
    names?: { short?: string };
    price?: { currentPrice?: number; regularPrice?: number };
    url?: string;
  };
}

/**
 * Best Buy's priceBlocks payload sometimes includes a verbose `sku.error` field
 * (e.g. wrapping a `ProductNotFoundException` from their internal catalog).
 * Boil it down to a short, user-facing reason. Keeps the upstream message
 * around as a fallback if we don't recognise the shape.
 */
function summarizeBestBuyError(raw: string): string {
  if (/ProductNotFoundException|product not found/i.test(raw)) {
    return "Best Buy's price API doesn't recognize this SKU. The product page may use Best Buy's newer /product/{code} catalog, which isn't exposed via priceBlocks. Try the SKU shown on the product page itself (labeled \"SKU:\" near the title) — that may differ from the digits in the URL.";
  }
  const statusMatch = raw.match(/status:\s*(\d{3})/i);
  if (statusMatch) {
    return `Best Buy returned HTTP ${statusMatch[1]} for this SKU`;
  }
  const trimmed = raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
  return `Best Buy: ${trimmed}`;
}

/**
 * Fetch product info for a batch of SKUs. Returns a Map keyed by SKU string,
 * containing exactly the requested SKUs (success or failure entries for each).
 */
export async function fetchProducts(
  skus: string[]
): Promise<Map<string, ProductResult>> {
  const results = new Map<string, ProductResult>();

  if (skus.length === 0) {
    return results;
  }

  const url = `${BESTBUY_ORIGIN}/api/3.0/priceBlocks?skus=${skus.join(",")}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.bestbuy.com/",
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    for (const sku of skus) {
      results.set(sku, { ok: false, sku, error: message });
    }
    return results;
  }

  if (!response.ok) {
    const errorMsg = `HTTP ${response.status}`;
    for (const sku of skus) {
      results.set(sku, { ok: false, sku, error: errorMsg });
    }
    return results;
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    for (const sku of skus) {
      results.set(sku, { ok: false, sku, error: "Invalid JSON response" });
    }
    return results;
  }

  if (!Array.isArray(payload)) {
    for (const sku of skus) {
      results.set(sku, { ok: false, sku, error: "Unexpected response shape" });
    }
    return results;
  }

  const entries = payload as RawSkuEntry[];

  for (const entry of entries) {
    const skuObj = entry?.sku;
    const skuId = skuObj?.skuId;

    if (!skuObj || !skuId) {
      // We can't key this back to a requested SKU; skip it. SKUs that go
      // unmatched will be filled in below with "Not found in response".
      continue;
    }

    if (typeof skuObj.error === "string" && skuObj.error.length > 0) {
      results.set(skuId, {
        ok: false,
        sku: skuId,
        error: summarizeBestBuyError(skuObj.error),
      });
      continue;
    }

    const buttonState = skuObj.buttonState?.buttonState;
    const purchasable = skuObj.buttonState?.purchasable;
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
        : productUrlForSku(skuId);

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

    results.set(skuId, result);
  }

  // Any requested SKU absent from the response gets a "Not found" error.
  for (const sku of skus) {
    if (!results.has(sku)) {
      results.set(sku, { ok: false, sku, error: "Not found in response" });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// /api/v2/product/{sku} — catalog-only fallback (no price, no buttonState)
// ---------------------------------------------------------------------------
//
// priceBlocks is the legacy index. SKUs that BB has migrated to its newer
// catalog (the `/product/{slug}/{BSIN}/sku/{sku}` URL family) come back as
// `ProductNotFoundException` from priceBlocks even though they're live on
// the storefront. The v2 product endpoint, by contrast, returns rich
// metadata for *every* SKU we've tested — but only metadata. No
// `buttonState`, no `price`. Use it when you just need name/brand/url to
// surface the item in the dashboard; live stock detection for these SKUs
// is the headless scraper's job.

export type ProductMeta = {
  ok: true;
  sku: string;
  name: string;
  brand?: string;
  canonicalUrl: string;
} | { ok: false; sku: string; error: string };

interface RawV2Product {
  skuId?: string;
  brand?: string;
  names?: { short?: string; title?: string };
  links?: {
    skuSpecificUrl?: { href?: string };
    seoPdpUrl?: { href?: string };
  };
}

export async function fetchProductMetaV2(sku: string): Promise<ProductMeta> {
  const url = `${BESTBUY_ORIGIN}/api/v2/product/${encodeURIComponent(sku)}`;
  let body: string;
  let statusCode: number;
  try {
    // v2/product sits behind the same Akamai TLS fingerprinting as priceBlocks,
    // so route through the curl-impersonate client (warmed session jar).
    const { tlsJsonGet } = await import("./bestbuy-tls");
    const r = await tlsJsonGet(url, 12_000);
    body = r.body;
    statusCode = r.statusCode;
  } catch (err) {
    return {
      ok: false,
      sku,
      error: err instanceof Error ? err.message : "Network error",
    };
  }

  if (statusCode < 200 || statusCode >= 300) {
    return { ok: false, sku, error: `v2 HTTP ${statusCode}` };
  }

  let payload: RawV2Product;
  try {
    payload = JSON.parse(body) as RawV2Product;
  } catch {
    return { ok: false, sku, error: "v2: invalid JSON" };
  }

  const name = payload.names?.short ?? payload.names?.title;
  if (typeof name !== "string" || name.length === 0) {
    return { ok: false, sku, error: "v2: missing product name" };
  }

  const canonical =
    payload.links?.skuSpecificUrl?.href ??
    payload.links?.seoPdpUrl?.href ??
    productUrlForSku(sku);

  const result: ProductMeta = {
    ok: true,
    sku,
    name,
    canonicalUrl: canonical,
  };
  if (typeof payload.brand === "string" && payload.brand.length > 0) {
    result.brand = payload.brand;
  }
  return result;
}

/** True when a priceBlocks failure looks like "BB has the SKU but the
 * legacy pricing index doesn't" — i.e. exactly the case where the v2
 * metadata fallback is worth trying. */
export function isMissingFromPriceBlocks(error: string): boolean {
  return /ProductNotFoundException|product not found|ProductInactiveException|PRODUCT_SKU_INACTIVE|doesn't recognize this SKU|does not recognize this SKU/i.test(
    error,
  );
}
