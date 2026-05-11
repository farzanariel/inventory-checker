/**
 * Best Buy headless PDP scraper — fallback for SKUs that the legacy
 * priceBlocks endpoint doesn't index (newer-catalog items return
 * `ProductNotFoundException`).
 *
 * Stack mirrors the chatter project: playwright-extra + stealth +
 * Apify fingerprint generator + residential proxy. Real Chromium so
 * Akamai Bot Manager's sensor-data challenge runs and plants
 * `_abck`/`bm_sz`/`ak_bmsc` cookies in the context.
 *
 * Performance notes (the reason this file is more than 50 lines):
 *
 *   - One **long-lived** browser + context per process. Akamai cookies
 *     persist ~1hr, so after the first warm-up call subsequent calls
 *     skip the 10–20s sensor solve entirely.
 *   - We block images, fonts, media, stylesheets and known analytics
 *     hosts. None affect the JSON-LD or buy-button extraction; loading
 *     them adds 5–15s of network-idle waiting we don't need.
 *   - We wait for the rendered buy-button selector
 *     (`[data-testid^="pdp-"][data-testid$="-{sku}"]`) — that's our
 *     truth signal — instead of `networkidle` (which never fires on
 *     BB pages because of long-poll analytics beacons).
 *   - The context auto-recycles after N consecutive failures or after
 *     a configurable max-age, in case Akamai rotates `_abck` mid-session.
 */

import { chromium } from "playwright-extra";
import type { Browser, BrowserContext, Route } from "playwright";
// puppeteer-extra-plugin-stealth ships its own .d.ts in newer versions, but
// the type for the default export is loose; we use it dynamically below.
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import {
  FingerprintGenerator,
  type BrowserFingerprintWithHeaders,
} from "fingerprint-generator";
import { FingerprintInjector } from "fingerprint-injector";

import type { ProductResult } from "./bestbuy";

chromium.use(StealthPlugin());

const fpGenerator = new FingerprintGenerator({
  browsers: [{ name: "chrome", minVersion: 128 }],
  operatingSystems: ["macos", "windows"],
  devices: ["desktop"],
  locales: ["en-US"],
});
const fpInjector = new FingerprintInjector();

export interface HeadlessOptions {
  /** `host:port` or `host:port:user:pass`. */
  proxy?: string;
  /** Per-navigation timeout. Default 25s — warm calls finish in 2–5s. */
  timeoutMs?: number;
  /** Force headed Chromium (debugging only). */
  headed?: boolean;
}

interface ParsedProxy {
  server: string;
  username?: string;
  password?: string;
}

function parseProxy(raw: string): ParsedProxy {
  const parts = raw.split(":");
  if (parts.length === 2) return { server: `http://${parts[0]}:${parts[1]}` };
  if (parts.length === 4) {
    return {
      server: `http://${parts[0]}:${parts[1]}`,
      username: parts[2],
      password: parts[3],
    };
  }
  throw new Error(
    `Bad proxy format: expected host:port or host:port:user:pass, got ${parts.length} parts`,
  );
}

// ---------- Shared browser pool ----------

interface PoolState {
  browser: Browser;
  context: BrowserContext;
  createdAt: number;
  failureStreak: number;
  warmedUp: boolean;
  proxyKey: string;
  headed: boolean;
}

let poolState: PoolState | null = null;
let poolInit: Promise<PoolState> | null = null;

const MAX_CONTEXT_AGE_MS = 45 * 60 * 1000; // recycle before _abck rotates
const MAX_FAILURE_STREAK = 3;
const BLOCKED_RESOURCE_TYPES = new Set(["image", "media", "font", "stylesheet"]);
const BLOCKED_HOST_SUBSTRINGS = [
  "google-analytics.com",
  "googletagmanager.com",
  "doubleclick.net",
  "facebook.net",
  "facebook.com",
  "criteo.com",
  "criteo.net",
  "adsrvr.org",
  "scorecardresearch.com",
  "newrelic.com",
  "nr-data.net",
  "demdex.net",
  "everesttech.net",
  "branch.io",
  "rfihub.com",
];

async function buildContext(opts: HeadlessOptions): Promise<PoolState> {
  const proxy = opts.proxy ? parseProxy(opts.proxy) : undefined;
  const fp: BrowserFingerprintWithHeaders = fpGenerator.getFingerprint();

  const browser = await chromium.launch({
    headless: !opts.headed,
    proxy,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
      "--dns-prefetch-disable",
    ],
  });

  const context = await browser.newContext({
    userAgent: fp.fingerprint.navigator.userAgent,
    viewport: {
      width: fp.fingerprint.screen.width,
      height: fp.fingerprint.screen.height,
    },
    locale: "en-US",
    timezoneId: "America/New_York",
    bypassCSP: true,
  });

  await fpInjector.attachFingerprintToPlaywright(context, fp);

  // tsx/esbuild compiles TS with a `__name(fn, "name")` helper; define
  // it as a no-op on every page so evaluated code doesn't ReferenceError.
  await context.addInitScript(() => {
    // @ts-expect-error - polyfill for esbuild's __name helper
    if (typeof window.__name !== "function") {
      // @ts-expect-error - assigning a polyfill onto window is intentional
      window.__name = (fn: unknown) => fn;
    }
  });

  // Page-level resource blocking: kills 80%+ of the bytes and gets us
  // off the network-idle critical path. Blocking is async-safe; we
  // don't await fulfill/abort because Playwright queues them.
  await context.route("**/*", (route: Route) => {
    const req = route.request();
    if (BLOCKED_RESOURCE_TYPES.has(req.resourceType())) {
      void route.abort();
      return;
    }
    const url = req.url();
    if (BLOCKED_HOST_SUBSTRINGS.some((h) => url.includes(h))) {
      void route.abort();
      return;
    }
    void route.continue();
  });

  return {
    browser,
    context,
    createdAt: Date.now(),
    failureStreak: 0,
    warmedUp: false,
    proxyKey: opts.proxy ?? "",
    headed: !!opts.headed,
  };
}

async function getPool(opts: HeadlessOptions): Promise<PoolState> {
  // Recycle if config changed (proxy / headed) or context aged out.
  if (poolState) {
    const stale =
      Date.now() - poolState.createdAt > MAX_CONTEXT_AGE_MS ||
      poolState.proxyKey !== (opts.proxy ?? "") ||
      poolState.headed !== !!opts.headed ||
      poolState.failureStreak >= MAX_FAILURE_STREAK;
    if (stale) await closePool();
  }
  if (poolState) return poolState;
  if (!poolInit) {
    poolInit = buildContext(opts).then((state) => {
      poolState = state;
      poolInit = null;
      return state;
    });
  }
  return poolInit;
}

export async function closePool(): Promise<void> {
  const old = poolState;
  poolState = null;
  poolInit = null;
  if (old) await old.browser.close().catch(() => {});
}

// ---------- Public API ----------

export async function scrapePdpForSku(
  sku: string,
  options: HeadlessOptions = {},
): Promise<ProductResult> {
  const timeoutMs = options.timeoutMs ?? 25_000;
  const pool = await getPool(options);
  const page = await pool.context.newPage();
  page.setDefaultTimeout(timeoutMs);
  page.setDefaultNavigationTimeout(timeoutMs);

  const trace = process.env.BB_HEADLESS_TRACE === "1";
  const t0 = Date.now();
  const log = (label: string) => {
    if (trace) console.log(`[hl ${sku}] +${Date.now() - t0}ms ${label}`);
  };
  try {
    const url = `https://www.bestbuy.com/site/-/${sku}.p?skuId=${sku}`;
    log("goto");
    const response = await page.goto(url, { waitUntil: "domcontentloaded" });
    log("domcontentloaded");
    if (!response) {
      pool.failureStreak += 1;
      return { ok: false, sku, error: "headless: no response" };
    }
    if (response.status() >= 400) {
      pool.failureStreak += 1;
      return { ok: false, sku, error: `headless: HTTP ${response.status()}` };
    }

    // The buy-button is our truth signal. Selector matches whatever state
    // BB ends up rendering: pdp-add-to-cart-{sku}, pdp-unavailable-{sku},
    // pdp-sold-out-{sku}, pdp-pre-order-{sku}, etc.
    await page.waitForSelector(
      `[data-testid^="pdp-"][data-testid$="-${sku}"]`,
      { timeout: timeoutMs, state: "attached" },
    );
    log("buy-button rendered");

    if (process.env.BB_HEADLESS_DEBUG === "1") {
      const fs = await import("node:fs/promises");
      await fs.writeFile(`/tmp/bb-pdp-${sku}.html`, await page.content());
    }

    const extracted = await page.evaluate((wantedSku: string) => {
      const ldRaw = document.getElementById("product-schema")?.textContent ?? null;
      const btn = document.querySelector(
        `[data-testid^="pdp-"][data-testid$="-${wantedSku}"]`,
      ) as HTMLElement | null;
      const buttonTestId = btn?.dataset.testid ?? null;
      const buttonStateTokens = Array.from(
        document.documentElement.outerHTML.matchAll(/"buttonState":"([A-Z_]+)"/g),
      ).map((m) => m[1]);
      return { ldRaw, buttonTestId, buttonStateTokens, url: location.href };
    }, sku);

    interface JsonLdOffer {
      "@type"?: string;
      price?: number;
      itemCondition?: string;
    }
    interface JsonLdProduct {
      name?: string;
      brand?: { name?: string };
      url?: string;
      offers?: JsonLdOffer | JsonLdOffer[];
    }
    let ld: JsonLdProduct | null = null;
    if (extracted.ldRaw) {
      try {
        ld = JSON.parse(extracted.ldRaw) as JsonLdProduct;
      } catch {
        /* ignore */
      }
    }

    const offers: JsonLdOffer[] = ld?.offers
      ? Array.isArray(ld.offers)
        ? ld.offers
        : [ld.offers]
      : [];
    const newOffer =
      offers.find((o) => o.itemCondition === "https://schema.org/NewCondition") ??
      offers[0];

    const name = ld?.name;
    const brand = ld?.brand?.name;
    const currentPrice = typeof newOffer?.price === "number" ? newOffer.price : undefined;

    // Map rendered buy-button → canonical buttonState (SPEC §6.4).
    const TESTID_TO_STATE: Record<string, string> = {
      "add-to-cart": "ADD_TO_CART",
      "low-stock": "LOW_STOCK",
      "in-cart": "IN_CART",
      "sold-out": "SOLD_OUT",
      "sold-out-online": "SOLD_OUT_ONLINE",
      unavailable: "SOLD_OUT",
      "check-stores": "CHECK_STORES",
      "coming-soon": "COMING_SOON",
      "pre-order": "PRE_ORDER",
      "notify-me": "SOLD_OUT",
    };
    let buttonState: string | undefined;
    if (extracted.buttonTestId) {
      const slug = extracted.buttonTestId
        .replace(/^pdp-/, "")
        .replace(new RegExp(`-${sku}$`), "");
      buttonState = TESTID_TO_STATE[slug];
    }
    if (!buttonState) {
      const PRIORITY = [
        "ADD_TO_CART",
        "LOW_STOCK",
        "IN_CART",
        "PRE_ORDER",
        "COMING_SOON",
        "CHECK_STORES",
        "SOLD_OUT_ONLINE",
        "SOLD_OUT",
      ];
      const found = new Set(extracted.buttonStateTokens);
      buttonState = PRIORITY.find((s) => found.has(s));
    }
    const purchasable =
      buttonState === "ADD_TO_CART" ||
      buttonState === "LOW_STOCK" ||
      buttonState === "IN_CART";

    if (typeof name !== "string" || typeof currentPrice !== "number" || !buttonState) {
      pool.failureStreak += 1;
      return {
        ok: false,
        sku,
        error: `headless: incomplete extraction (name=${typeof name}, price=${typeof currentPrice}, buttonState=${buttonState}, testid=${extracted.buttonTestId})`,
      };
    }

    log("extracted");
    pool.failureStreak = 0;
    pool.warmedUp = true;
    const result: ProductResult = {
      ok: true,
      sku,
      name,
      currentPriceCents: Math.round(currentPrice * 100),
      buttonState,
      purchasable,
      canonicalUrl: ld?.url ?? extracted.url,
    };
    if (brand) result.brand = brand;
    return result;
  } catch (err) {
    pool.failureStreak += 1;
    const message = err instanceof Error ? err.message : "headless: unknown error";
    return { ok: false, sku, error: `headless: ${message}` };
  } finally {
    await page.close().catch(() => {});
  }
}
