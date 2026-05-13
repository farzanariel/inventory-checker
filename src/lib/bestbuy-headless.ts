/**
 * Best Buy headless PDP scraper — fallback for SKUs that the legacy
 * priceBlocks endpoint doesn't index (newer-catalog items return
 * `ProductNotFoundException`).
 *
 * Stack uses **patchright** — a Playwright fork with sensor-evading
 * patches baked into the browser runtime (patches runtime.enable,
 * navigator.webdriver, WebGL/canvas, plugins, permissions) so the
 * browser passes Akamai Bot Manager's sensor-data challenge.
 *
 * Three-component strategy (NEC-34):
 *
 *   1. Stealth browser — patchright replaces playwright-extra +
 *      puppeteer-extra-plugin-stealth. The patches live in the
 *      browser binary itself, not in a JS layer that can be detected.
 *   2. Residential proxy — plumbed through patchright's `proxy`
 *      launch option. Sticky session per SKU via proxy auth.
 *   3. Session warming — visit `https://www.bestbuy.com/` first,
 *      wait for sensor.js to complete and `_abck` cookie to be marked
 *      valid. Persist all storage state (cookies + localStorage) per
 *      residential session. Reuse across consecutive SKU checks until
 *      cookies expire (Akamai _abck typically lives ~1hr).
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

import { chromium } from "patchright";
import type { Browser, BrowserContext, Route } from "patchright";
import {
  FingerprintGenerator,
  type BrowserFingerprintWithHeaders,
} from "fingerprint-generator";
import { FingerprintInjector } from "fingerprint-injector";

import type { ProductResult } from "./bestbuy";

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
  /** Per-navigation timeout. Default 45s — first-paint via residential
   * proxy consistently takes 15–20s, so 25s leaves no margin. */
  timeoutMs?: number;
  /** Force headed Chromium (debugging only). */
  headed?: boolean;
  /** Path to a storage state file to load (session warming). If set,
   * the warmed cookies + localStorage are applied to the context on
   * creation instead of doing a fresh warm-up. */
  storageStatePath?: string;
  /** Force a fresh warm-up even if warmed state exists. */
  forceWarmup?: boolean;
  /** Session warming timeout (default 30s). */
  warmupTimeoutMs?: number;
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
  /** Storage state path used for this context. Empty string if no
   * persistence was configured. */
  storageStatePath: string;
  /** When warming was last done (0 if never). */
  lastWarmupAt: number;
  /**
   * Monotonically increasing generation number. Each call to scrapePdpForSku
   * captures the generation at pool acquisition; if the generation changes
   * under it (pool recycled by another concurrent call), the call can detect
   * staleness and retry with a fresh reference instead of using a dying browser.
   */
  generation: number;
}

let poolState: PoolState | null = null;
let poolInit: Promise<PoolState> | null = null;
let generationCounter = 0;

/**
 * Browsers that have been recycled out of the active pool but may still have
 * in-flight pages from concurrent scrapePdpForSku calls. We defer closing
 * them until after the microtask queue settles so those pages can complete
 * naturally instead of crashing with "browser has been closed".
 */
const drainingBrowsers: Browser[] = [];

const MAX_CONTEXT_AGE_MS = 45 * 60 * 1000; // recycle before _abck rotates
const MAX_FAILURE_STREAK = 3;
const SESSION_WARMUP_EXPIRY_MS = 30 * 60 * 1000; // re-warm after 30min
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
  const storageStatePath = opts.storageStatePath ?? "";

  const browser = await chromium.launch({
    headless: !opts.headed,
    proxy,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
      "--dns-prefetch-disable",
    ],
  });

  const contextOptions: Parameters<typeof browser.newContext>[0] = {
    userAgent: fp.fingerprint.navigator.userAgent,
    viewport: {
      width: fp.fingerprint.screen.width,
      height: fp.fingerprint.screen.height,
    },
    locale: "en-US",
    timezoneId: "America/New_York",
    bypassCSP: true,
  };

  // Load warmed storage state if available and not forcing a refresh.
  if (storageStatePath && !opts.forceWarmup) {
    const fs = await import("node:fs/promises");
    try {
      await fs.access(storageStatePath);
      contextOptions.storageState = storageStatePath;
    } catch {
      // No saved state — will warm up fresh below.
    }
  }

  const context = await browser.newContext(contextOptions);

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

  // Apply fingerprint AFTER route setup so the injector works properly.
  // patchright is a Playwright fork with identical runtime API; cast is
  // needed because fingerprint-injector's types reference playwright-core
  // types that aren't structurally identical to patchright's patched types.
  await fpInjector.attachFingerprintToPlaywright(context as never, fp);

  return {
    browser,
    context,
    createdAt: Date.now(),
    failureStreak: 0,
    warmedUp: false,
    proxyKey: opts.proxy ?? "",
    headed: !!opts.headed,
    storageStatePath,
    lastWarmupAt: 0,
    generation: 0, // overwritten by getPool's .then() handler
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
    if (stale) {
      drainingBrowsers.push(poolState.browser);
      poolState = null;
      poolInit = null;
    }
  }
  if (poolState) return poolState;
  if (!poolInit) {
    generationCounter += 1;
    const gen = generationCounter;
    poolInit = buildContext(opts).then((state) => {
      state.generation = gen;
      poolState = state;
      poolInit = null;
      return state;
    });
  }
  const pool = await poolInit;
  // Sweep drained browsers after a microtask tick so in-flight pages
  // from the old generation can close naturally before we tear down.
  if (drainingBrowsers.length > 0) {
    const toClose = drainingBrowsers.splice(0);
    setImmediate(() => {
      for (const b of toClose) b.close().catch(() => {});
    });
  }
  return pool;
}

/**
 * Public accessor for the shared patchright BrowserContext. Used by other
 * retailer modules (e.g. `microcenter.ts`) that want to ride on the same
 * pool, proxy, and resource-blocking setup. Skips the BB-specific Akamai
 * warm-up; callers that need a warm `_abck` cookie should keep using
 * `scrapePdpForSku` (or call `warmSession` themselves).
 */
export async function getHeadlessContext(
  options: HeadlessOptions = {},
): Promise<BrowserContext> {
  const resolved: HeadlessOptions = {
    ...options,
    proxy: options.proxy ?? process.env.BB_PROXY ?? undefined,
    storageStatePath:
      options.storageStatePath ??
      process.env.BB_STORAGE_STATE ??
      undefined,
  };
  const pool = await getPool(resolved);
  return pool.context;
}

export async function closePool(): Promise<void> {
  const old = poolState;
  poolState = null;
  poolInit = null;
  if (old) {
    drainingBrowsers.push(old.browser);
    const toClose = drainingBrowsers.splice(0);
    setImmediate(() => {
      for (const b of toClose) b.close().catch(() => {});
    });
  }
}

// ---------- Session warming ----------

/**
 * Visit the Best Buy homepage to trigger Akamai's sensor-data challenge
 * (sensor.js), then wait until `_abck` cookie is present and valid.
 *
 * This plants the Akamai cookies (`_abck`, `bm_sz`, `ak_bmsc`) in the
 * browser context so subsequent PDP page loads skip the 10–20s sensor
 * solve and load immediately.
 *
 * If `storageStatePath` is set, the full storage state (cookies +
 * localStorage) is persisted to disk after warming so it can be reused
 * across process restarts without doing a fresh warm-up.
 *
 * Returns `true` if warming succeeded, `false` if it failed.
 */
export async function warmSession(
  context: BrowserContext,
  storageStatePath?: string,
  timeoutMs: number = 30_000,
): Promise<boolean> {
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  page.setDefaultNavigationTimeout(timeoutMs);

  try {
    console.log("[warming] visiting bestbuy.com to trigger sensor.js…");
    await page.goto("https://www.bestbuy.com/", { waitUntil: "domcontentloaded" });

    // Wait for the page to settle — Akamai sensor.js runs asynchronously
    // after page load and plants `_abck` cookie once the challenge passes.
    // We wait up to timeoutMs for the cookie to appear and look valid.
    const abckPresent = await page.waitForFunction(() => {
      const match = document.cookie.match(/(?:^|;\s*)_abck=([^;]+)/);
      if (!match) return false;
      // _abck values that don't start with digits are "pending" or
      // "failed" markers. A value starting with `\d+` suggests it's
      // a real challenge-passed token. (Akamai internal format varies.)
      return /^\d/.test(match[1]);
    }, { timeout: timeoutMs }).then(() => true).catch(() => false);

    if (!abckPresent) {
      console.log("[warming] _abck cookie not detected — challenge may not have completed");
      // Still try to persist whatever state we have — partial state is
      // better than none, and some SKUs may still work.
    } else {
      console.log("[warming] _abck cookie detected — sensor challenge passed");
    }

    // Persist storage state if a path is configured.
    if (storageStatePath) {
      const fs = await import("node:fs/promises");
      const dir = storageStatePath.substring(0, storageStatePath.lastIndexOf("/"));
      if (dir) {
        await fs.mkdir(dir, { recursive: true });
      }
      const state = await context.storageState();
      await fs.writeFile(storageStatePath, JSON.stringify(state, null, 2));
      console.log(`[warming] storage state persisted to ${storageStatePath}`);
    }

    return abckPresent;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.log(`[warming] session warming failed: ${message}`);
    return false;
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Check whether a warmed session needs refreshing.
 */
function isWarmupStale(pool: PoolState): boolean {
  if (!pool.warmedUp) return true;
  if (pool.lastWarmupAt === 0) return true;
  return Date.now() - pool.lastWarmupAt > SESSION_WARMUP_EXPIRY_MS;
}

// ---------- Public API ----------

export async function scrapePdpForSku(
  sku: string,
  options: HeadlessOptions = {},
): Promise<ProductResult> {
  const resolved: HeadlessOptions = {
    ...options,
    proxy: options.proxy ?? process.env.BB_PROXY ?? undefined,
    storageStatePath:
      options.storageStatePath ??
      process.env.BB_STORAGE_STATE ??
      undefined,
  };
  const timeoutMs = resolved.timeoutMs ?? 45_000;
  const pool = await getPool(resolved);

  // Warm the session if needed (first time or stale).
  if (isWarmupStale(pool) || resolved.forceWarmup) {
    const warmOk = await warmSession(
      pool.context,
      pool.storageStatePath || undefined,
      resolved.warmupTimeoutMs ?? 30_000,
    );
    pool.warmedUp = true;
    pool.lastWarmupAt = Date.now();
    if (!warmOk) {
      console.log(`[hl ${sku}] warm-up did not confirm _abck — proceeding anyway`);
    }
  }

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

    // Persist storage state after a successful scrape so warmed cookies
    // survive process restarts and don't need a fresh warm-up.
    if (pool.storageStatePath && !resolved.forceWarmup) {
      const state = await pool.context.storageState();
      const fs = await import("node:fs/promises");
      const fsPath = pool.storageStatePath;
      const dir = fsPath.substring(0, fsPath.lastIndexOf("/"));
      if (dir) {
        await fs.mkdir(dir, { recursive: true });
      }
      await fs.writeFile(fsPath, JSON.stringify(state, null, 2)).catch(() => {});
    }

    return result;
  } catch (err) {
    pool.failureStreak += 1;
    const message = err instanceof Error ? err.message : "headless: unknown error";
    return { ok: false, sku, error: `headless: ${message}` };
  } finally {
    await page.close().catch(() => {});
  }
}
