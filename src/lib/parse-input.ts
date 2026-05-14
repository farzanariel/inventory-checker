/**
 * Parse a Best Buy product URL or raw SKU into a SKU string.
 *
 * Accepted formats (in order of preference):
 *   1. New URL:  https://www.bestbuy.com/product/{slug}/sku/{6-8 digits}
 *   2. Old URL:  https://www.bestbuy.com/site/{slug}/{6-8 digits}.p?skuId={6-8 digits}
 *   3. Raw SKU:  6 to 8 digits
 *
 * Liberal in what it accepts (extra query strings, trailing slashes, http/https),
 * strict in what it returns (just the SKU digits).
 *
 * NOTE: This is the SYNCHRONOUS pattern-only parser. Best Buy also publishes
 * landing-page URLs of the shape `bestbuy.com/product/{slug}/{ALPHANUMERIC}`
 * (from ads/search) where no numeric SKU appears in the URL. Use the async
 * `resolveSkuFromInput` to handle those — it falls back to fetching the page
 * and reading the canonical link / og:url / JSON-LD sku.
 */
export function parseUrlOrSku(
  input: string
): { ok: true; sku: string } | { ok: false; error: string } {
  if (typeof input !== "string") {
    return { ok: false, error: "Input must be a string" };
  }

  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return { ok: false, error: "Input is empty" };
  }

  // 1. New URL format: /sku/{6-8 digits}
  const newUrlMatch = trimmed.match(/\/sku\/(\d{6,8})\b/);
  if (newUrlMatch) {
    return { ok: true, sku: newUrlMatch[1] };
  }

  // 2a. Old URL format: {6-8 digits}.p
  const oldUrlPMatch = trimmed.match(/(\d{6,8})\.p/);
  if (oldUrlPMatch) {
    return { ok: true, sku: oldUrlPMatch[1] };
  }

  // 2b. Old URL format query param: skuId={6-8 digits}
  const oldUrlSkuIdMatch = trimmed.match(/[?&]skuId=(\d{6,8})\b/);
  if (oldUrlSkuIdMatch) {
    return { ok: true, sku: oldUrlSkuIdMatch[1] };
  }

  // 3. Raw SKU: only digits, 6 to 8 of them
  const rawMatch = trimmed.match(/^(\d{6,8})$/);
  if (rawMatch) {
    return { ok: true, sku: rawMatch[1] };
  }

  return {
    ok: false,
    error:
      "Could not extract a Best Buy SKU. Paste a Best Buy product URL or a 6–8 digit SKU.",
  };
}

const BESTBUY_PRODUCT_URL_RE =
  /^https?:\/\/(?:www\.)?bestbuy\.com\/product\/[^\s]+/i;
const BESTBUY_ANY_URL_RE = /^https?:\/\/(?:www\.)?bestbuy\.com\//i;
const MICROCENTER_URL_RE =
  /^https?:\/\/(?:www\.)?microcenter\.com\/product\/(\d{4,7})\b/i;

/**
 * Parse a MicroCenter product URL into a product ID (SPEC §21.3).
 *
 * URL shape: `https://www.microcenter.com/product/{productId}/{slug}`.
 * The `{productId}` is the 6-digit numeric ID in the path — NOT the retail
 * SKU (which appears in JSON-LD on the page). Bare numeric input is NOT
 * accepted: collisions with Best Buy SKUs make it ambiguous.
 */
export function parseMicroCenterUrl(
  input: string
): { ok: true; mcProductId: string } | { ok: false; error: string } {
  if (typeof input !== "string") {
    return { ok: false, error: "Input must be a string" };
  }
  const m = input.trim().match(MICROCENTER_URL_RE);
  if (!m) {
    return {
      ok: false,
      error:
        "Could not extract a MicroCenter product ID. Paste the full PDP URL (e.g. https://www.microcenter.com/product/688173/...).",
    };
  }
  return { ok: true, mcProductId: m[1] };
}

export type ProductInput =
  | { ok: true; retailer: "bestbuy"; sku: string }
  | { ok: true; retailer: "microcenter"; mcProductId: string }
  | { ok: false; error: string };

/**
 * Cheap synchronous dispatcher across retailers. Tries MC first (URL must
 * contain `microcenter.com`), then falls through to the BB parser.
 */
export function parseProductInput(input: string): ProductInput {
  if (typeof input === "string" && /microcenter\.com/i.test(input)) {
    const mc = parseMicroCenterUrl(input);
    if (mc.ok) return { ok: true, retailer: "microcenter", mcProductId: mc.mcProductId };
    return mc;
  }
  const bb = parseUrlOrSku(input);
  if (bb.ok) return { ok: true, retailer: "bestbuy", sku: bb.sku };
  return bb;
}

/**
 * Cheap synchronous check: does this input look like something we *might* be
 * able to resolve to a SKU, either by pattern alone or by hitting the network?
 *
 * Used by the AddItemDialog to decide whether to fire the preview lookup.
 * Returning `true` here doesn't guarantee resolution — the server still has
 * the final say.
 */
export function looksResolvableBestBuyInput(input: string): boolean {
  if (typeof input !== "string") return false;
  const trimmed = input.trim();
  if (trimmed.length === 0) return false;
  if (parseUrlOrSku(trimmed).ok) return true;
  return BESTBUY_PRODUCT_URL_RE.test(trimmed);
}

/**
 * Same shape as `looksResolvableBestBuyInput` but cross-retailer. Used by
 * the AddItemDialog to gate the preview-fetch debounce.
 */
export function looksResolvableProductInput(input: string): boolean {
  if (typeof input !== "string") return false;
  const trimmed = input.trim();
  if (trimmed.length === 0) return false;
  if (parseProductInput(trimmed).ok) return true;
  // Network-fallback shapes: BB /product/ ad URLs.
  return BESTBUY_PRODUCT_URL_RE.test(trimmed);
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.bestbuy.com/",
} as const;

export interface ResolveOptions {
  /** Override fetch — used by tests to inject mocked responses. */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in ms (default 10s). */
  timeoutMs?: number;
  /** Server-side fallback for Best Buy ad/landing pages blocked by fetch. */
  landingPageResolver?: (
    url: string,
    timeoutMs: number,
  ) => Promise<{ html: string; finalUrl: string } | null>;
}

/**
 * Resolve an input to a Best Buy SKU.
 *
 * Tries `parseUrlOrSku` first (cheap, no network). If the input is a Best Buy
 * `/product/` ad/landing-page URL with no numeric SKU in it, try a short
 * fetch — Best Buy's edge tarpits this route from most server IPs, so we cap
 * the attempt aggressively and return a clear, actionable error rather than
 * blocking the UI on a long timeout.
 *
 * On the happy path (request goes through, redirects or HTML scrape yield the
 * SKU), we return it. Otherwise we tell the user how to recover.
 *
 * Best Buy's edge does TLS fingerprinting; we use Node's native `fetch`
 * (undici), not curl. Browser-like headers per SPEC §6.
 */
const AD_URL_RECOVERY_HINT =
  "Best Buy doesn't expose the SKU in this ad/landing URL and blocks server-side resolution. Open the link in your browser, then either paste the new URL from the address bar (it'll contain `.p?skuId=...`) or paste the SKU number directly (visible on the product page).";

/**
 * Async cross-retailer dispatcher. Recognizes MicroCenter URLs synchronously
 * (no network fallback for MC — must be a parseable URL); for Best Buy,
 * delegates to `resolveSkuFromInput` which handles the ad/landing-page
 * fallback fetch.
 */
export async function resolveProductInput(
  input: string,
  options: ResolveOptions = {}
): Promise<ProductInput> {
  if (typeof input === "string" && /microcenter\.com/i.test(input)) {
    const mc = parseMicroCenterUrl(input);
    if (mc.ok) return { ok: true, retailer: "microcenter", mcProductId: mc.mcProductId };
    return mc;
  }
  const bb = await resolveSkuFromInput(input, options);
  if (bb.ok) return { ok: true, retailer: "bestbuy", sku: bb.sku };
  return bb;
}

export async function resolveSkuFromInput(
  input: string,
  options: ResolveOptions = {}
): Promise<{ ok: true; sku: string } | { ok: false; error: string }> {
  const sync = parseUrlOrSku(input);
  if (sync.ok) return sync;

  const trimmed = typeof input === "string" ? input.trim() : "";
  if (!BESTBUY_PRODUCT_URL_RE.test(trimmed)) {
    // Not a shape we can resolve — fall through with the original error.
    return sync;
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  // 4s cap: in practice the request either succeeds in <1s or tarpits past 30s.
  // 4s keeps the dialog snappy while still leaving margin for a slow but real
  // response if BB ever stops blocking us.
  const timeoutMs = options.timeoutMs ?? 4_000;
  const resolveViaLandingPage = async () => {
    const proxyResult = options.landingPageResolver
      ? await options.landingPageResolver(trimmed, timeoutMs)
      : null;
    if (!proxyResult) return null;
    const finalUrlParse = parseUrlOrSku(proxyResult.finalUrl);
    if (finalUrlParse.ok) return finalUrlParse;
    const proxySku = extractSkuFromHtml(proxyResult.html);
    return proxySku ? { ok: true as const, sku: proxySku } : null;
  };

  let response: Response;
  try {
    response = await fetchImpl(trimmed, {
      headers: { ...BROWSER_HEADERS },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    const proxyResolved = await resolveViaLandingPage();
    if (proxyResolved) return proxyResolved;
    return { ok: false, error: AD_URL_RECOVERY_HINT };
  }

  if (!response.ok) {
    const proxyResolved = await resolveViaLandingPage();
    if (proxyResolved) return proxyResolved;
    return { ok: false, error: AD_URL_RECOVERY_HINT };
  }

  // After redirects, the final URL may already be the /site/.../{sku}.p form.
  if (typeof response.url === "string" && BESTBUY_ANY_URL_RE.test(response.url)) {
    const finalUrlParse = parseUrlOrSku(response.url);
    if (finalUrlParse.ok) return finalUrlParse;
  }

  let html: string;
  try {
    html = await response.text();
  } catch {
    return { ok: false, error: AD_URL_RECOVERY_HINT };
  }

  const sku = extractSkuFromHtml(html);
  if (sku) return { ok: true, sku };

  const proxyResolved = await resolveViaLandingPage();
  if (proxyResolved) return proxyResolved;

  return { ok: false, error: AD_URL_RECOVERY_HINT };
}

/**
 * Best-effort scrape of a Best Buy product page HTML body for the SKU.
 * Order of attempts (most specific → most lenient):
 *   1. <link rel="canonical" href="..."> — parse as a Best Buy URL
 *   2. <meta property="og:url" content="..."> — parse as a Best Buy URL
 *   3. JSON-LD `"sku": "{6-8 digits}"` (Product schema)
 *   4. Inline JSON `"skuId": "{6-8 digits}"`
 */
function extractSkuFromHtml(html: string): string | null {
  const canonical = html.match(
    /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i
  );
  if (canonical) {
    const parsed = parseUrlOrSku(canonical[1]);
    if (parsed.ok) return parsed.sku;
  }

  const ogUrl = html.match(
    /<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/i
  );
  if (ogUrl) {
    const parsed = parseUrlOrSku(ogUrl[1]);
    if (parsed.ok) return parsed.sku;
  }

  const jsonLdSku = html.match(/"sku"\s*:\s*"(\d{6,8})"/);
  if (jsonLdSku) return jsonLdSku[1];

  const inlineSkuId = html.match(/"skuId"\s*:\s*"(\d{6,8})"/);
  if (inlineSkuId) return inlineSkuId[1];

  return null;
}
