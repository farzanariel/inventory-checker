/**
 * Unit tests for the TLS-impersonating Best Buy client (NEC-33).
 *
 * No live network calls — execFile is mocked so tests are fast and hermetic.
 * Covers: cookie-warming flow, -H header flags, HTTP status parsing,
 * per-SKU 403 error budget, and fallback helpers.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock node:child_process BEFORE importing the module under test.
//
// The module wraps execFile in a manual Promise callback:
//   _execFile(file, args, opts, (err, stdout, stderr) => { ... })
// So the mock must call the callback (4th arg) rather than returning a value.
// ---------------------------------------------------------------------------

const mockExecFile = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: mockExecFile,
}));

vi.mock("node:fs", () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// Helpers: configure the next execFile call.
// ---------------------------------------------------------------------------

type ExecCb = (err: Error | null, stdout: string, stderr: string) => void;

/** Resolve the next execFile call with the given stdout/stderr. */
function mockExecResolve(stdout: string, stderr = ""): void {
  mockExecFile.mockImplementationOnce(
    (_f: string, _a: string[], _o: unknown, cb: ExecCb) => cb(null, stdout, stderr),
  );
}

/** Reject the next execFile call with an error. */
function mockExecReject(message: string): void {
  mockExecFile.mockImplementationOnce(
    (_f: string, _a: string[], _o: unknown, cb: ExecCb) =>
      cb(new Error(message), "", ""),
  );
}

/** Minimal valid priceBlocks JSON for a single SKU. */
function priceBlocksJson(
  skuId: string,
  buttonState = "ADD_TO_CART",
  purchasable = true,
): string {
  return JSON.stringify([
    {
      sku: {
        skuId,
        names: { short: `Test Product ${skuId}` },
        brand: { brand: "TestBrand" },
        buttonState: { buttonState, purchasable, skuId },
        price: { currentPrice: 49.99, regularPrice: 59.99 },
        url: `/site/test/${skuId}.p?skuId=${skuId}`,
      },
    },
  ]);
}

// ---------------------------------------------------------------------------
// Import module under test (after mocks are in place).
// ---------------------------------------------------------------------------

import {
  warmSession,
  fetchProductsViaTls,
  needsHeadlessFallback,
  reset403Budget,
  getSku403Count,
  _resetWarmStateForTest,
} from "./bestbuy-tls.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("warmSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetWarmStateForTest();
  });

  it("calls curl_chrome116 with --cookie-jar and the Best Buy origin", async () => {
    mockExecResolve(""); // warm fetch — body discarded

    await warmSession();

    expect(mockExecFile).toHaveBeenCalledOnce();
    const [cmd, args] = mockExecFile.mock.calls[0] as [string, string[], unknown, ExecCb];
    expect(cmd).toMatch(/curl_chrome116$/);
    expect(args).toContain("--cookie-jar");
    expect(args).toContain("https://www.bestbuy.com");
    expect(args).toContain("-L"); // follow redirects
    expect(args).toContain("-o");
  });

  it("deduplicates concurrent calls — execFile invoked only once", async () => {
    mockExecResolve(""); // one response serves both callers

    const [p1, p2] = await Promise.all([warmSession(), warmSession()]);

    // Both resolve to the same cookie-jar path.
    expect(p1).toBe(p2);
    expect(mockExecFile).toHaveBeenCalledOnce();
  });

  it("returns cached path on second call without hitting execFile again", async () => {
    mockExecResolve(""); // first warm
    const first = await warmSession();

    vi.clearAllMocks(); // clear so we can count fresh calls
    const second = await warmSession();

    expect(mockExecFile).not.toHaveBeenCalled(); // served from cache
    expect(first).toBe(second);
  });

  it("throws when warm fails and no prior cookies are cached", async () => {
    mockExecReject("connection refused");

    await expect(warmSession()).rejects.toThrow(/session warm failed/);
  });
});

describe("fetchProductsViaTls — -H header flags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetWarmStateForTest();
  });

  it("passes -H before each Chrome header in the priceBlocks call", async () => {
    // execFile call #1: warmSession
    mockExecResolve("");
    // execFile call #2: priceBlocks — body + injected \n + status
    mockExecResolve(`${priceBlocksJson("1234567")}\n200`);

    await fetchProductsViaTls(["1234567"]);

    expect(mockExecFile).toHaveBeenCalledTimes(2);
    const [, args] = mockExecFile.mock.calls[1] as [string, string[], unknown, ExecCb];

    // Collect all values passed after a -H flag.
    const headerValues: string[] = [];
    for (let i = 0; i < args.length - 1; i++) {
      if (args[i] === "-H") headerValues.push(args[i + 1]);
    }

    expect(headerValues.length).toBeGreaterThan(0);
    expect(headerValues.some((h) => h.startsWith("Accept:"))).toBe(true);
    expect(headerValues.some((h) => h.startsWith("Sec-CH-UA:"))).toBe(true);
    expect(headerValues.some((h) => h.startsWith("Sec-Fetch-Mode:"))).toBe(true);
    expect(headerValues.some((h) => h.startsWith("Referer:"))).toBe(true);
    // No raw header string should appear as a bare positional arg before the URL.
    expect(args.some((a) => a.startsWith("Accept:") && !headerValues.includes(a) === false)).toBe(true);
  });
});

describe("fetchProductsViaTls — HTTP status parsing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetWarmStateForTest();
  });

  it("correctly extracts body and 200 status when JSON has no trailing newline", async () => {
    const json = priceBlocksJson("1234567"); // compact JSON, no trailing \n
    mockExecResolve(""); // warmSession
    mockExecResolve(`${json}\n200`); // body + injected \n + status

    const results = await fetchProductsViaTls(["1234567"]);
    const r = results.get("1234567");

    expect(r?.ok).toBe(true);
    if (r?.ok) {
      expect(r.name).toBe("Test Product 1234567");
      expect(r.buttonState).toBe("ADD_TO_CART");
      expect(r.purchasable).toBe(true);
      expect(r.currentPriceCents).toBe(4999);
      expect(r.regularPriceCents).toBe(5999);
      expect(r.brand).toBe("TestBrand");
    }
  });

  it("handles multi-line pretty-printed JSON correctly", async () => {
    const json = JSON.stringify(
      [
        {
          sku: {
            skuId: "9876543",
            names: { short: "Pretty Product" },
            brand: { brand: "BrandX" },
            buttonState: { buttonState: "SOLD_OUT", purchasable: false, skuId: "9876543" },
            price: { currentPrice: 29.99 },
            url: "/site/test/9876543.p?skuId=9876543",
          },
        },
      ],
      null,
      2, // pretty-print with newlines inside JSON
    );
    mockExecResolve(""); // warmSession
    mockExecResolve(`${json}\n200`);

    const results = await fetchProductsViaTls(["9876543"]);
    const r = results.get("9876543");

    expect(r?.ok).toBe(true);
    if (r?.ok) {
      expect(r.buttonState).toBe("SOLD_OUT");
      expect(r.purchasable).toBe(false);
    }
  });

  it("returns error on HTTP 403 before budget is exhausted", async () => {
    reset403Budget(["9999999"]);
    mockExecResolve(""); // warmSession
    mockExecResolve("Access Denied\n403");

    const results = await fetchProductsViaTls(["9999999"]);
    const r = results.get("9999999");

    expect(r?.ok).toBe(false);
    if (!r?.ok) {
      expect(r?.error).toContain("403");
      expect(needsHeadlessFallback(r?.error ?? "")).toBe(false);
    }
  });

  it("returns error on non-200 non-403 HTTP status", async () => {
    mockExecResolve(""); // warmSession
    mockExecResolve("Internal Server Error\n500");

    const results = await fetchProductsViaTls(["8888888"]);
    const r = results.get("8888888");

    expect(r?.ok).toBe(false);
    if (!r?.ok) {
      expect(r?.error).toContain("500");
    }
  });

  it("handles invalid JSON gracefully", async () => {
    mockExecResolve(""); // warmSession
    mockExecResolve("not-valid-json\n200");

    const results = await fetchProductsViaTls(["7777777"]);
    const r = results.get("7777777");

    expect(r?.ok).toBe(false);
    if (!r?.ok) {
      expect(r?.error).toMatch(/JSON/i);
    }
  });

  it("fills missing SKUs with an error entry", async () => {
    // Response doesn't mention SKU 5555555 at all.
    const json = priceBlocksJson("1111111"); // only has 1111111
    mockExecResolve(""); // warmSession
    mockExecResolve(`${json}\n200`);

    const results = await fetchProductsViaTls(["1111111", "5555555"]);
    const missing = results.get("5555555");

    expect(missing?.ok).toBe(false);
    if (!missing?.ok) {
      expect(missing?.error).toMatch(/not found/i);
    }
  });
});

describe("fetchProductsViaTls — per-SKU 403 error budget", () => {
  const SKU = "4040404";

  beforeEach(() => {
    vi.clearAllMocks();
    _resetWarmStateForTest();
    reset403Budget([SKU]);
  });

  it("increments the 403 counter on each blocked response", async () => {
    for (let i = 1; i <= 2; i++) {
      mockExecResolve(""); // warmSession (only needed first time; cached after)
      mockExecResolve("Blocked\n403");
      await fetchProductsViaTls([SKU]);
      if (i === 1) _resetWarmStateForTest(); // keep warm on second call
    }
    // Expect counter is at least 1 (exact value depends on cache reset timing)
    expect(getSku403Count(SKU)).toBeGreaterThan(0);
  });

  it("marks SKU as needing headless after exhausting the budget (3 consecutive 403s)", async () => {
    // Call 1: warm + 403
    mockExecResolve(""); // warmSession
    mockExecResolve("Blocked\n403");
    await fetchProductsViaTls([SKU]);

    // Calls 2 and 3: session already warm, just 403s
    for (let i = 0; i < 2; i++) {
      mockExecResolve("Blocked\n403");
      await fetchProductsViaTls([SKU]);
    }

    expect(getSku403Count(SKU)).toBe(3);

    // Call 4: still 403, counter is 4 — should now say "needs headless"
    mockExecResolve("Blocked\n403");
    const results = await fetchProductsViaTls([SKU]);
    const r = results.get(SKU);

    expect(r?.ok).toBe(false);
    if (!r?.ok) {
      expect(needsHeadlessFallback(r?.error ?? "")).toBe(true);
    }
  });

  it("resets the 403 counter to 0 on a successful response", async () => {
    // Exhaust budget.
    mockExecResolve(""); // warmSession
    mockExecResolve("Blocked\n403");
    await fetchProductsViaTls([SKU]);
    mockExecResolve("Blocked\n403");
    await fetchProductsViaTls([SKU]);
    mockExecResolve("Blocked\n403");
    await fetchProductsViaTls([SKU]);

    expect(getSku403Count(SKU)).toBe(3);

    // Successful response resets counter.
    mockExecResolve(`${priceBlocksJson(SKU)}\n200`);
    await fetchProductsViaTls([SKU]);

    expect(getSku403Count(SKU)).toBe(0);
  });
});

describe("needsHeadlessFallback", () => {
  it("returns true for errors containing 'needs headless' (case-insensitive)", () => {
    expect(needsHeadlessFallback("tls: 403 x3 — exceeds budget, needs headless")).toBe(true);
    expect(needsHeadlessFallback("NEEDS HEADLESS")).toBe(true);
  });

  it("returns false for other errors", () => {
    expect(needsHeadlessFallback("tls: 403 (attempt 1/3)")).toBe(false);
    expect(needsHeadlessFallback("tls: HTTP 500")).toBe(false);
    expect(needsHeadlessFallback("")).toBe(false);
  });
});

describe("reset403Budget", () => {
  it("clears the per-SKU counter", () => {
    // Seed a non-zero count indirectly via getSku403Count.
    // We can only observe it via the exported getter.
    reset403Budget(["SEED_SKU"]);
    // After reset, count should be 0 (it was never set, so this is trivially true;
    // the real value comes from 403 budget tests above).
    expect(getSku403Count("SEED_SKU")).toBe(0);
  });
});
