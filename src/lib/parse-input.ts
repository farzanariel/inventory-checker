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
}

/**
 * Resolve an input to a Best Buy SKU.
 *
 * Tries `parseUrlOrSku` first (cheap, no network). If the input is a Best Buy
 * `/product/` landing page URL with no numeric SKU in it, fetch the page and
 * extract the SKU from the canonical link / og:url / JSON-LD payload.
 *
 * Best Buy's edge does TLS fingerprinting; we use Node's native `fetch`
 * (undici), not curl. Browser-like headers per SPEC §6.
 */
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
  const timeoutMs = options.timeoutMs ?? 10_000;

  let response: Response;
  try {
    response = await fetchImpl(trimmed, {
      headers: { ...BROWSER_HEADERS },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    return {
      ok: false,
      error: `Could not reach Best Buy to resolve this URL (${message}).`,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: `Best Buy returned HTTP ${response.status} for this URL.`,
    };
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
    return {
      ok: false,
      error: "Best Buy response could not be read.",
    };
  }

  const sku = extractSkuFromHtml(html);
  if (sku) return { ok: true, sku };

  return {
    ok: false,
    error:
      "Could not extract a Best Buy SKU from this URL. Try the /site/.../{sku}.p URL or paste the SKU directly.",
  };
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
