/**
 * MicroCenter stock detection — headless HTML scrape via shared §20 pool.
 *
 * Per SPEC §21: one fetch returns inventory across all ~32 stores plus the
 * "Shippable Items" web-fulfillment store (029). Cloudflare's managed
 * challenge requires the patchright + residential proxy stack; native fetch
 * gets a 403 challenge page.
 */

import { getHeadlessContext } from "./bestbuy-headless";

export type McStoreInventory = {
  storeNumber: string;
  storeName: string;
  qoh: number;
};

export type McProductResult =
  | {
      ok: true;
      mcProductId: string;
      name: string;
      brand?: string;
      imageUrl?: string;
      currentPriceCents: number;
      canonicalUrl: string;
      stores: McStoreInventory[];
    }
  | { ok: false; mcProductId: string; error: string };

const MC_ORIGIN = "https://www.microcenter.com";

export function microcenterPdpUrl(
  mcProductId: string,
  storeNumber?: string,
): string {
  const base = `${MC_ORIGIN}/product/${mcProductId}/x`;
  return storeNumber ? `${base}?storeid=${storeNumber}` : base;
}

export function microcenterImageUrl(
  mcProductId: string,
  sku?: string,
): string | undefined {
  if (!sku) return undefined;
  return `https://productimages.microcenter.com/${mcProductId}_${sku}.jpg`;
}

interface RawInventoryEntry {
  qoh?: number;
  storeNumber?: string;
  storeName?: string;
  productId?: number;
}

interface JsonLdProduct {
  "@type"?: string | string[];
  name?: string;
  image?: string | string[];
  brand?: { name?: string } | string;
  offers?: { price?: string | number } | Array<{ price?: string | number }>;
}

function isProductLd(obj: unknown): obj is JsonLdProduct {
  if (!obj || typeof obj !== "object") return false;
  const t = (obj as { "@type"?: unknown })["@type"];
  if (typeof t === "string") return t === "Product";
  if (Array.isArray(t)) return t.includes("Product");
  return false;
}

function extractJsonLdProduct(html: string): JsonLdProduct | null {
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const candidates: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { "@graph"?: unknown[] })["@graph"])
    ) {
      candidates.push(...(parsed as { "@graph": unknown[] })["@graph"]);
    }
    for (const c of candidates) {
      if (isProductLd(c)) return c;
    }
  }
  return null;
}

function priceFromLd(ld: JsonLdProduct | null): number | null {
  if (!ld?.offers) return null;
  const offer = Array.isArray(ld.offers) ? ld.offers[0] : ld.offers;
  const p = offer?.price;
  if (typeof p === "number" && Number.isFinite(p)) {
    return Math.round(p * 100);
  }
  if (typeof p === "string") {
    const n = parseFloat(p);
    if (Number.isFinite(n)) return Math.round(n * 100);
  }
  return null;
}

function imageFromLd(ld: JsonLdProduct | null): string | undefined {
  if (!ld?.image) return undefined;
  if (Array.isArray(ld.image)) {
    const first = ld.image.find((x) => typeof x === "string" && x.length > 0);
    return typeof first === "string" ? first : undefined;
  }
  return typeof ld.image === "string" && ld.image.length > 0
    ? ld.image
    : undefined;
}

function brandFromLd(ld: JsonLdProduct | null): string | undefined {
  if (!ld?.brand) return undefined;
  if (typeof ld.brand === "string") return ld.brand || undefined;
  return typeof ld.brand.name === "string" && ld.brand.name.length > 0
    ? ld.brand.name
    : undefined;
}

/**
 * Walk forward from the opening `[` at `openIdx`, tracking nested
 * brackets and skipping string literals (so a `]` inside a quoted store
 * name can't terminate us early). Returns the index of the matching `]`,
 * or -1 if unbalanced.
 */
function findArrayClose(html: string, openIdx: number): number {
  if (html[openIdx] !== "[") return -1;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = openIdx; i < html.length; i++) {
    const c = html[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function titleFallback(html: string): string | undefined {
  const m = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (!m) return undefined;
  return m[1].replace(/\s*-\s*Micro Center\s*$/i, "").trim() || undefined;
}

export function parseMicroCenterHtml(
  html: string,
  mcProductId: string,
): McProductResult {
  if (/<title>\s*Just a moment\.\.\.\s*<\/title>/i.test(html)) {
    return {
      ok: false,
      mcProductId,
      error: "Bot detection page (Cloudflare challenge)",
    };
  }

  // MC embeds the per-store inventory as `var inventory = [...]`. Regex
  // alone is fragile: the page has many other `]` chars later, and a
  // non-greedy `\[[\s\S]*?\]` may match a far-away `]` that happens to
  // sit before a `;`. Locate the opening `[`, then walk forward
  // bracket-balanced (skipping string literals) to find the matching `]`.
  const invStart = html.search(/var inventory\s*=\s*\[/);
  if (invStart === -1) {
    return { ok: false, mcProductId, error: "inventory block not found" };
  }
  const openIdx = html.indexOf("[", invStart);
  const closeIdx = findArrayClose(html, openIdx);
  if (closeIdx === -1) {
    return { ok: false, mcProductId, error: "inventory close-bracket not found" };
  }
  const invText = html.slice(openIdx, closeIdx + 1);
  let rawInv: unknown;
  try {
    rawInv = JSON.parse(invText);
  } catch {
    return { ok: false, mcProductId, error: "inventory parse failed" };
  }
  if (!Array.isArray(rawInv)) {
    return { ok: false, mcProductId, error: "inventory parse failed" };
  }
  const stores: McStoreInventory[] = [];
  for (const e of rawInv as RawInventoryEntry[]) {
    if (
      !e ||
      typeof e.storeNumber !== "string" ||
      typeof e.storeName !== "string" ||
      typeof e.qoh !== "number"
    ) {
      continue;
    }
    stores.push({
      storeNumber: e.storeNumber,
      storeName: e.storeName,
      qoh: Math.max(0, Math.trunc(e.qoh)),
    });
  }

  let priceCents: number | null = null;
  const pricingAttr = html.match(
    /<span[^>]*id=["']pricing["'][^>]*content=["']([0-9.]+)["']/i,
  );
  if (pricingAttr) {
    const n = parseFloat(pricingAttr[1]);
    if (Number.isFinite(n)) priceCents = Math.round(n * 100);
  }

  const ld = extractJsonLdProduct(html);
  if (priceCents === null) {
    priceCents = priceFromLd(ld);
  }
  if (priceCents === null) {
    return { ok: false, mcProductId, error: "price not found" };
  }

  const name = ld?.name?.trim() || titleFallback(html);
  if (!name) {
    return { ok: false, mcProductId, error: "name not found" };
  }

  const result: McProductResult = {
    ok: true,
    mcProductId,
    name,
    currentPriceCents: priceCents,
    canonicalUrl: `${MC_ORIGIN}/product/${mcProductId}/x`,
    stores,
  };
  const brand = brandFromLd(ld);
  if (brand) result.brand = brand;
  const imageUrl = imageFromLd(ld);
  if (imageUrl) result.imageUrl = imageUrl;
  return result;
}

export async function fetchMicroCenterProduct(
  mcProductId: string,
  options: { proxy?: string; timeoutMs?: number } = {},
): Promise<McProductResult> {
  const url = microcenterPdpUrl(mcProductId, "029");
  const timeoutMs = options.timeoutMs ?? 45_000;

  let context;
  try {
    context = await getHeadlessContext({ proxy: options.proxy });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    return { ok: false, mcProductId, error: `fetch failed: ${msg}` };
  }

  const page = await context.newPage();
  try {
    let response;
    try {
      response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      return { ok: false, mcProductId, error: `fetch failed: ${msg}` };
    }
    if (response && !response.ok()) {
      return { ok: false, mcProductId, error: `HTTP ${response.status()}` };
    }

    // Cloudflare serves an interstitial challenge page on first contact and
    // swaps in the real PDP only after its JS challenge solves itself
    // (a few seconds). The real product page is identified by `body#product`;
    // the challenge page's body has no id. `domcontentloaded` fires on the
    // challenge page, so wait explicitly for the post-clearance markup.
    const cleared = await page
      .waitForSelector("body#product", { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);

    if (!cleared) {
      return {
        ok: false,
        mcProductId,
        error: "Bot detection page (Cloudflare challenge did not clear)",
      };
    }

    // Real PDP rendered. Belt-and-suspenders: ensure the inventory script
    // and pricing have streamed in before reading.
    await page
      .waitForFunction(
        () => /var inventory\s*=\s*\[/.test(document.documentElement.outerHTML),
        { timeout: 10_000 },
      )
      .catch(() => {});
    await page
      .waitForSelector("#pricing, .big-price", { timeout: 5_000 })
      .catch(() => {});

    const html = await page.content();
    return parseMicroCenterHtml(html, mcProductId);
  } finally {
    await page.close().catch(() => {});
  }
}
