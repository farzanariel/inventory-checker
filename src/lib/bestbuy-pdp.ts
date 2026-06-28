/**
 * PDP scraper via residential proxy (NEC-44).
 *
 * Fallback for SKUs that return ProductNotFoundException from the priceBlocks
 * API (e.g. SKU 6663816 / Acer Aspire Lite). Uses curl_chrome116 routed
 * through a residential HTTP CONNECT proxy to bypass Akamai's H2 enforcement
 * on PDP pages.
 *
 * Configured via env vars:
 *   BESTBUY_PDP_PROXY  — "user:pass@host:port" (required to enable this path)
 *
 * Extracts from PDP HTML:
 *   - buttonState from inline JS  ("buttonState":"ADD_TO_CART" / etc.)
 *   - price + name from JSON-LD   (application/ld+json, Offer + Product)
 *   - canonicalUrl from redirect  (curl follows --location)
 */

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { productUrlForSku, type ProductResult } from "./bestbuy";
import { getBestBuyCurlProxyArgs } from "./proxies";

// ── config ─────────────────────────────────────────────────────────────────

const CURL_CHROME = "/usr/local/bin/curl_chrome116";
const COOKIE_DIR = join(tmpdir(), "inventory-checker");
const PDP_COOKIE_JAR = join(COOKIE_DIR, "bestbuy-pdp-proxy-cookies.txt");

const SESSION_TTL_MS = 20 * 60 * 1000; // 20 min
const MAX_CONCURRENT = 2;              // parallel proxy connections
const JITTER_BASE_MS = 150;            // stagger concurrent starts; residential proxy handles rate limiting

const UA_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36";

const WARMUP_HEADERS: string[] = [
  "-H", `User-Agent: ${UA_CHROME}`,
  "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "-H", "Accept-Language: en-US,en;q=0.9",
  "-H", 'Sec-CH-UA: "Chromium";v="116", "Not)A;Brand";v="24", "Google Chrome";v="116"',
  "-H", "Sec-CH-UA-Mobile: ?0",
  "-H", 'Sec-CH-UA-Platform: "macOS"',
  "-H", "Sec-Fetch-Dest: document",
  "-H", "Sec-Fetch-Mode: navigate",
  "-H", "Sec-Fetch-Site: none",
  "-H", "Sec-Fetch-User: ?1",
];

const PDP_HEADERS: string[] = [
  "-H", `User-Agent: ${UA_CHROME}`,
  "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "-H", "Accept-Language: en-US,en;q=0.9",
  "-H", "Referer: https://www.bestbuy.com/",
  "-H", 'Sec-CH-UA: "Chromium";v="116", "Not)A;Brand";v="24", "Google Chrome";v="116"',
  "-H", "Sec-CH-UA-Mobile: ?0",
  "-H", 'Sec-CH-UA-Platform: "macOS"',
  "-H", "Sec-Fetch-Dest: document",
  "-H", "Sec-Fetch-Mode: navigate",
  "-H", "Sec-Fetch-Site: same-origin",
];

// ── module-level state ─────────────────────────────────────────────────────

let activeSlots = 0;
let sessionLastWarmedAt = 0;
let warmingPromise: Promise<void> | null = null;

// ── proxy URL ──────────────────────────────────────────────────────────────

async function proxyArgs(): Promise<string[] | null> {
  return getBestBuyCurlProxyArgs();
}

// ── internal helpers ───────────────────────────────────────────────────────

function jitterMs(): number {
  return JITTER_BASE_MS * (0.7 + Math.random() * 0.6);
}

function spawnCurl(
  args: string[]
): Promise<{ stdout: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(CURL_CHROME, args, { timeout: 25_000 });
    const chunks: Buffer[] = [];
    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.on("error", reject);
    proc.on("close", (code) =>
      resolve({ stdout: Buffer.concat(chunks).toString("utf8"), exitCode: code ?? 1 })
    );
  });
}

async function warmSessionIfStale(proxy: string[]): Promise<void> {
  if (Date.now() - sessionLastWarmedAt < SESSION_TTL_MS) return;

  if (warmingPromise) {
    await warmingPromise;
    return;
  }

  warmingPromise = (async () => {
    try {
      mkdirSync(COOKIE_DIR, { recursive: true });
      await spawnCurl([
        ...proxy,
        ...WARMUP_HEADERS,
        "-b", PDP_COOKIE_JAR,
        "-c", PDP_COOKIE_JAR,
        "--compressed",
        "--silent",
        "--max-time", "12",
        "--location",
        "https://www.bestbuy.com/",
      ]);
      sessionLastWarmedAt = Date.now();
      console.log("[bestbuy-pdp] proxy session warmed");
    } catch (err) {
      console.warn("[bestbuy-pdp] proxy session warm failed:", err);
    } finally {
      warmingPromise = null;
    }
  })();

  await warmingPromise;
}

async function acquireSlot(): Promise<void> {
  while (activeSlots >= MAX_CONCURRENT) {
    await new Promise<void>((r) => setTimeout(r, 50));
  }
  activeSlots++;
}

function releaseSlot(): void {
  activeSlots = Math.max(0, activeSlots - 1);
}

// ── HTML extraction ────────────────────────────────────────────────────────

interface PdpExtracted {
  buttonState: string | null;
  priceCents: number | null;
  name: string | null;
  canonicalUrl: string;
}

function extractFromHtml(html: string, finalUrl: string, sku: string): PdpExtracted {
  // buttonState from inline JS initializer (multiple occurrences — take first clean one)
  const bsMatch = html.match(/"buttonState":"([A-Z_]+)"/);
  const buttonState = bsMatch?.[1] ?? null;

  // JSON-LD blocks — find a Product schema with an Offer that has price
  let priceCents: number | null = null;
  let name: string | null = null;

  const jldPattern = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let jldMatch: RegExpExecArray | null;
  while ((jldMatch = jldPattern.exec(html)) !== null) {
    try {
      const d = JSON.parse(jldMatch[1].trim()) as Record<string, unknown>;
      if (!name && typeof d.name === "string" && d["@type"] === "Product") {
        name = d.name;
      }
      const offers = d.offers;
      const offerArr: unknown[] = Array.isArray(offers) ? offers : [offers];
      for (const offer of offerArr) {
        if (
          offer !== null &&
          typeof offer === "object" &&
          "price" in (offer as object) &&
          typeof (offer as Record<string, unknown>).price === "number"
        ) {
          priceCents = Math.round((offer as Record<string, unknown>).price as number * 100);
          break;
        }
      }
    } catch {
      // malformed JSON-LD — skip
    }
  }

  // Canonical URL from the final URL after --location redirects, or fall back
  const canonicalUrl: string =
    finalUrl.length > 0 && finalUrl.includes("bestbuy.com")
      ? finalUrl
      : productUrlForSku(sku);

  return { buttonState, priceCents, name, canonicalUrl };
}

// ── public API ─────────────────────────────────────────────────────────────

/**
 * Reset state (for test isolation only).
 */
export function _resetPdpState(): void {
  activeSlots = 0;
  sessionLastWarmedAt = 0;
  warmingPromise = null;
}

async function fetchOneSku(sku: string, proxy: string[]): Promise<ProductResult> {
  const pdpUrl = productUrlForSku(sku);
  let stdout: string;
  let exitCode: number;
  try {
    const res = await spawnCurl([
      ...proxy,
      ...PDP_HEADERS,
      "-b", PDP_COOKIE_JAR,
      "-c", PDP_COOKIE_JAR,
      "--compressed",
      "--silent",
      "--max-time", "15",
      "--location",
      "--write-out", "\n---CURLINFO---\nhttp_code=%{http_code}\nurl_effective=%{url_effective}",
      pdpUrl,
    ]);
    stdout = res.stdout;
    exitCode = res.exitCode;
  } catch (err) {
    return { ok: false, sku, error: `curl spawn error: ${String(err)}` };
  }

  if (exitCode !== 0) {
    return { ok: false, sku, error: `curl_chrome116 exit ${exitCode}` };
  }

  const infoIdx = stdout.indexOf("\n---CURLINFO---\n");
  const body = infoIdx >= 0 ? stdout.slice(0, infoIdx) : stdout;
  const infoBlock = infoIdx >= 0 ? stdout.slice(infoIdx) : "";

  const httpCode = (infoBlock.match(/http_code=(\d+)/) ?? [])[1];
  const finalUrl = (infoBlock.match(/url_effective=(.+)/) ?? [])[1]?.trim() ?? "";
  const status = parseInt(httpCode ?? "0", 10);

  if (status !== 200) {
    return { ok: false, sku, error: `HTTP ${status} (PDP proxy)` };
  }

  if (body.length < 5_000 || body.includes("Access Denied")) {
    return { ok: false, sku, error: "Bot detection page (PDP proxy)" };
  }

  const { buttonState, priceCents, name, canonicalUrl } = extractFromHtml(body, finalUrl, sku);

  if (!buttonState) {
    return { ok: false, sku, error: "buttonState not found in PDP HTML" };
  }

  return {
    ok: true,
    sku,
    name: name ?? `SKU ${sku}`,
    currentPriceCents: priceCents ?? 0,
    buttonState,
    purchasable: buttonState === "ADD_TO_CART" || buttonState === "LOW_STOCK",
    canonicalUrl,
  };
}

/**
 * Fetch product info for a set of SKUs by scraping their PDP pages through a
 * residential proxy. Fetches up to MAX_CONCURRENT SKUs in parallel.
 *
 * Returns an error result for all SKUs if no saved or env proxy is configured.
 */
export async function fetchProductsViaPdp(
  skus: string[]
): Promise<Map<string, ProductResult>> {
  const results = new Map<string, ProductResult>();
  if (skus.length === 0) return results;

  const proxy = await proxyArgs();
  if (!proxy) {
    for (const sku of skus) {
      results.set(sku, { ok: false, sku, error: "PDP proxy not configured" });
    }
    return results;
  }

  await warmSessionIfStale(proxy);

  // Fetch all SKUs concurrently (bounded by MAX_CONCURRENT semaphore).
  // Stagger launch times slightly to avoid bursting the proxy simultaneously.
  const entries = await Promise.all(
    skus.map(async (sku, i): Promise<[string, ProductResult]> => {
      if (i > 0) await new Promise<void>((r) => setTimeout(r, jitterMs() * i));
      await acquireSlot();
      try {
        const result = await fetchOneSku(sku, proxy);
        return [sku, result];
      } finally {
        releaseSlot();
      }
    })
  );

  for (const [sku, result] of entries) {
    results.set(sku, result);
  }
  return results;
}
