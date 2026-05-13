/**
 * Unit tests for bestbuy-tls.ts — TLS-impersonating HTTP client.
 *
 * Tests cover:
 *   - needsHeadlessFallback (pure function, no mocking)
 *   - getSku403Count / reset403Budget (pure functions)
 *   - fetchProductsViaTls: Chrome headers, response parsing, error budgets
 *
 * No live network calls: child_process.execFile is mocked throughout.
 * Mocks use callback style because the module wraps execFile with promisify.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock — use vi.hoisted so the factory runs before vi.mock hoists it
// ---------------------------------------------------------------------------

const { mockExecFile } = vi.hoisted(() => {
  return { mockExecFile: vi.fn() };
});

vi.mock("node:child_process", () => ({
  execFile: mockExecFile,
}));

import * as tls from "@/lib/bestbuy-tls";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCurlResponse(body: string, statusCode: number) {
  return { stdout: `${body}\n${statusCode}`, stderr: "" };
}

function makeValidPriceBlocksResponse(skus: string[]) {
  const entries = skus.map((sku) => ({
    sku: {
      skuId: sku,
      names: { short: `Product ${sku}` },
      price: { currentPrice: 49.99, regularPrice: 59.99 },
      buttonState: { buttonState: "ADD_TO_CART", purchasable: true, skuId: sku },
      brand: { brand: "Best Buy" },
    },
  }));
  return JSON.stringify(entries);
}

/**
 * Set up mock execFile to respond for both warm and API calls.
 * - Warm calls (to bestbuy.com): returns empty response
 * - API calls (priceBlocks): calls `apiFn(bin, args)` to produce the response
 *
 * Uses callback style because promisify wraps the real module execFile.
 * vi.fn() mockImplementation receives args: (bin, args, opts, callback)
 */
function mockApi(apiFn: (bin: string, args: string[]) => { stdout: string; stderr: string }) {
  mockExecFile.mockImplementation((...args: unknown[]) => {
    const cmdArgs = args[1] as string[];
    const callback = args[args.length - 1] as (
      err: Error | null,
      stdout: string,
      stderr: string,
    ) => void;

    if ((cmdArgs as string[]).some((a) => a.includes("priceBlocks"))) {
      const result = apiFn("", cmdArgs);
      callback(null, result.stdout, result.stderr);
    } else {
      callback(null, "", "");
    }
  });
}

// ---------------------------------------------------------------------------
// Pure function tests — no execFile needed
// ---------------------------------------------------------------------------

describe("needsHeadlessFallback", () => {
  it.each([
    ["exceeds budget (3)", "tls: 403 x3 — exceeds budget, needs headless", true],
    ["exceeds budget (5)", "tls: 403 x5 — exceeds budget, needs headless", true],
    ["first attempt", "tls: 403 (attempt 1/3)", false],
    ["second attempt", "tls: 403 (attempt 2/3)", false],
    ["HTTP 500", "tls: HTTP 500", false],
    ["warm failed", "Session warm failed", false],
    ["other error", "tls: network error", false],
  ])("= %s → %s", (_label, error, expected) => {
    expect(tls.needsHeadlessFallback(error)).toBe(expected);
  });
});

describe("getSku403Count / reset403Budget", () => {
  it("starts at 0", () => {
    expect(tls.getSku403Count("ANY")).toBe(0);
  });

  it("reset clears specified SKUs", () => {
    tls.reset403Budget(["A", "B"]);
    expect(tls.getSku403Count("A")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// fetchProductsViaTls — execFile is mocked
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockExecFile.mockReset();
  tls.resetTlsState();
});

describe("fetchProductsViaTls", () => {
  it("sends Chrome 116 headers and parses valid response", async () => {
    mockApi((_bin, args) => {
      return makeCurlResponse(makeValidPriceBlocksResponse(["SKU001"]), 200);
    });

    const results = await tls.fetchProductsViaTls(["SKU001"]);

    expect(mockExecFile).toHaveBeenCalled();
    const apiCalls = mockExecFile.mock.calls.filter((c: unknown[]) =>
      (c[1] as string[]).some((a: string) => a.includes("priceBlocks")),
    );
    expect(apiCalls.length).toBeGreaterThanOrEqual(1);

    const args = apiCalls[0][1] as string[];
    // Chrome-specific headers
    expect(args).toContain(
      'Sec-CH-UA: "Not/A)Brand";v="99", "Google Chrome";v="116", "Chromium";v="116"',
    );
    expect(args).toContain("Sec-Fetch-Dest: empty");
    expect(args).toContain("Sec-Fetch-Mode: cors");
    expect(args).toContain("Sec-Fetch-Site: same-origin");
    expect(args).toContain("Referer: https://www.bestbuy.com/");
    expect(args).toContain("--cookie-jar");
    expect(args).toContain("--cookie");
    expect(args).toContain("--compressed");
    expect(args.some((a: string) => a.includes("priceBlocks?skus=SKU001"))).toBe(true);

    // Verify parsed result
    expect(results.size).toBe(1);
    const r = results.get("SKU001")!;
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sku).toBe("SKU001");
      expect(r.name).toBe("Product SKU001");
      expect(r.currentPriceCents).toBe(4999);
      expect(r.buttonState).toBe("ADD_TO_CART");
      expect(r.purchasable).toBe(true);
    }
  });

  it("tracks consecutive 403s and escalates to headless fallback", async () => {
    mockApi((_bin, _args) => {
      return makeCurlResponse("Forbidden", 403);
    });

    // Attempt 1 — budget at 1/3
    let results = await tls.fetchProductsViaTls(["SKU001"]);
    let r = results.get("SKU001")!;
    if (r.ok === false) {
      expect(r.error).toContain("attempt 1/3");
      expect(tls.needsHeadlessFallback(r.error)).toBe(false);
    }

    // Attempt 2 — budget at 2/3
    results = await tls.fetchProductsViaTls(["SKU001"]);
    r = results.get("SKU001")!;
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.error).toContain("attempt 2/3");
      expect(tls.needsHeadlessFallback(r.error)).toBe(false);
    }

    // Attempt 3 — exceeds budget (3 >= 3 budget)
    results = await tls.fetchProductsViaTls(["SKU001"]);
    r = results.get("SKU001")!;
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.error).toContain("exceeds budget");
      expect(tls.needsHeadlessFallback(r.error)).toBe(true);
    }

    // Attempt 4 — still exceeds budget
    results = await tls.fetchProductsViaTls(["SKU001"]);
    r = results.get("SKU001")!;
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.error).toContain("exceeds budget");
      expect(tls.needsHeadlessFallback(r.error)).toBe(true);
    }

    // A different SKU should still be at 0
    expect(tls.getSku403Count("OTHER_SKU")).toBe(0);
  });

  it("resets 403 budget after a successful call", async () => {
    // First call: 403
    mockApi((_bin, _args) => {
      return makeCurlResponse("Forbidden", 403);
    });
    await tls.fetchProductsViaTls(["SKU001"]);
    expect(tls.getSku403Count("SKU001")).toBe(1);

    // Second call: success
    mockApi((_bin, _args) => {
      return makeCurlResponse(makeValidPriceBlocksResponse(["SKU001"]), 200);
    });
    await tls.fetchProductsViaTls(["SKU001"]);
    expect(tls.getSku403Count("SKU001")).toBe(0);
  });

  it("handles empty SKU list", async () => {
    const results = await tls.fetchProductsViaTls([]);
    expect(results.size).toBe(0);
  });

  it("handles non-403 HTTP errors", async () => {
    mockApi((_bin, _args) => {
      return makeCurlResponse("Bad Request", 400);
    });
    const results = await tls.fetchProductsViaTls(["SKU001"]);
    const r = results.get("SKU001")!;
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error).toContain("HTTP 400");
  });

  it("handles network errors", async () => {
    mockExecFile.mockImplementation((_bin: string, args: string[], _opts: unknown, callback: Function) => {
      if ((args as string[]).some((a) => a.includes("priceBlocks"))) {
        callback(new Error("ETIMEDOUT"));
      } else {
        callback(null, "", "");
      }
    });
    const results = await tls.fetchProductsViaTls(["SKU001"]);
    const r = results.get("SKU001")!;
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error).toContain("ETIMEDOUT");
  });

  it("recognizes ProductNotFoundException in response", async () => {
    const body = JSON.stringify([
      {
        sku: {
          skuId: "SKU_BAD",
          error: "ProductNotFoundException: SKU not in index",
        },
      },
    ]);
    mockApi((_bin, _args) => {
      return makeCurlResponse(body, 200);
    });
    const results = await tls.fetchProductsViaTls(["SKU_BAD"]);
    const r = results.get("SKU_BAD")!;
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error).toContain("doesn't recognize");
  });

  it("fills SKUs absent from response with 'Not found'", async () => {
    const body = JSON.stringify([
      {
        sku: {
          skuId: "SKU_A",
          names: { short: "A" },
          price: { currentPrice: 10.0 },
          buttonState: {
            buttonState: "ADD_TO_CART",
            purchasable: true,
            skuId: "SKU_A",
          },
        },
      },
    ]);
    mockApi((_bin, _args) => {
      return makeCurlResponse(body, 200);
    });
    const results = await tls.fetchProductsViaTls(["SKU_A", "SKU_B"]);
    expect(results.size).toBe(2);
    expect(results.get("SKU_A")!.ok).toBe(true);
    const b = results.get("SKU_B")!;
    expect(b.ok).toBe(false);
    if (b.ok === false) expect(b.error).toBe("Not found in response");
  });
});
