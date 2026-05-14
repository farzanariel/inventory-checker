import { describe, test, expect, vi } from "vitest";
import {
  parseUrlOrSku,
  parseMicroCenterUrl,
  parseProductInput,
  looksResolvableBestBuyInput,
  looksResolvableProductInput,
  resolveSkuFromInput,
  resolveProductInput,
} from "./parse-input";

describe("parseMicroCenterUrl", () => {
  test("extracts productId from canonical PDP URL", () => {
    expect(
      parseMicroCenterUrl(
        "https://www.microcenter.com/product/688173/apple-mac-mini-mu9d3ll-a-(late-2024)-desktop-computer",
      ),
    ).toEqual({ ok: true, mcProductId: "688173" });
  });

  test("http and no-www variants accepted", () => {
    expect(parseMicroCenterUrl("http://microcenter.com/product/708467/foo")).toEqual({
      ok: true,
      mcProductId: "708467",
    });
  });

  test("trailing slash / no slug still parses", () => {
    expect(parseMicroCenterUrl("https://www.microcenter.com/product/688173/")).toEqual({
      ok: true,
      mcProductId: "688173",
    });
    expect(parseMicroCenterUrl("https://www.microcenter.com/product/688173")).toEqual({
      ok: true,
      mcProductId: "688173",
    });
  });

  test("non-MC URL rejected", () => {
    const r = parseMicroCenterUrl("https://www.bestbuy.com/product/sku/12345");
    expect(r.ok).toBe(false);
  });

  test("bare numeric input rejected (would collide with BB)", () => {
    const r = parseMicroCenterUrl("688173");
    expect(r.ok).toBe(false);
  });

  test("non-string input rejected", () => {
    // @ts-expect-error intentionally passing wrong type
    expect(parseMicroCenterUrl(null).ok).toBe(false);
  });
});

describe("parseProductInput (dispatcher)", () => {
  test("MC URL routes to microcenter branch", () => {
    expect(
      parseProductInput("https://www.microcenter.com/product/688173/apple-mac-mini"),
    ).toEqual({ ok: true, retailer: "microcenter", mcProductId: "688173" });
  });

  test("BB URL routes to bestbuy branch", () => {
    expect(
      parseProductInput("https://www.bestbuy.com/site/-/6587182.p?skuId=6587182"),
    ).toEqual({ ok: true, retailer: "bestbuy", sku: "6587182" });
  });

  test("bare numeric routes to bestbuy", () => {
    expect(parseProductInput("6587182")).toEqual({
      ok: true,
      retailer: "bestbuy",
      sku: "6587182",
    });
  });

  test("malformed MC URL returns MC error, not BB error", () => {
    const r = parseProductInput("https://www.microcenter.com/category/foo");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/MicroCenter/i);
  });
});

describe("looksResolvableProductInput", () => {
  test("accepts BB and MC URLs and bare SKU", () => {
    expect(looksResolvableProductInput("https://www.microcenter.com/product/688173/x")).toBe(true);
    expect(looksResolvableProductInput("6587182")).toBe(true);
    expect(looksResolvableProductInput("https://www.bestbuy.com/product/foo/sku/6505727")).toBe(true);
  });
  test("rejects empty and unrelated", () => {
    expect(looksResolvableProductInput("")).toBe(false);
    expect(looksResolvableProductInput("https://amazon.com/dp/B0XYZ")).toBe(false);
  });
});

describe("resolveProductInput", () => {
  test("MC URL resolves synchronously without network fetch", async () => {
    const fetchImpl = vi.fn();
    const r = await resolveProductInput(
      "https://www.microcenter.com/product/688173/apple-mac-mini",
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(r).toEqual({ ok: true, retailer: "microcenter", mcProductId: "688173" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("parseUrlOrSku", () => {
  test("new URL format extracts SKU from /sku/ segment", () => {
    const r = parseUrlOrSku(
      "https://www.bestbuy.com/product/sony-wh-1000xm5/sku/6505727",
    );
    expect(r).toEqual({ ok: true, sku: "6505727" });
  });

  test("new URL format works with 8-digit SKU", () => {
    const r = parseUrlOrSku(
      "https://www.bestbuy.com/product/item/sku/12345678",
    );
    expect(r).toEqual({ ok: true, sku: "12345678" });
  });

  test("old URL format (.p suffix) extracts SKU", () => {
    const r = parseUrlOrSku(
      "https://www.bestbuy.com/site/acer-chromebook/6587182.p?skuId=6587182",
    );
    expect(r).toEqual({ ok: true, sku: "6587182" });
  });

  test("old URL format via skuId query param only", () => {
    const r = parseUrlOrSku(
      "https://www.bestbuy.com/cart?skuId=1234567",
    );
    expect(r).toEqual({ ok: true, sku: "1234567" });
  });

  test("raw 6-digit SKU", () => {
    expect(parseUrlOrSku("123456")).toEqual({ ok: true, sku: "123456" });
  });

  test("raw 7-digit SKU", () => {
    expect(parseUrlOrSku("6587182")).toEqual({ ok: true, sku: "6587182" });
  });

  test("raw 8-digit SKU", () => {
    expect(parseUrlOrSku("12345678")).toEqual({ ok: true, sku: "12345678" });
  });

  test("5-digit raw input is rejected", () => {
    const r = parseUrlOrSku("12345");
    expect(r.ok).toBe(false);
  });

  test("9-digit raw input is rejected", () => {
    const r = parseUrlOrSku("123456789");
    expect(r.ok).toBe(false);
  });

  test("empty string returns error", () => {
    const r = parseUrlOrSku("");
    expect(r.ok).toBe(false);
  });

  test("whitespace-only string returns error", () => {
    const r = parseUrlOrSku("   ");
    expect(r.ok).toBe(false);
  });

  test("unrelated URL returns error", () => {
    const r = parseUrlOrSku("https://www.amazon.com/dp/B09X7CRKRZ");
    expect(r.ok).toBe(false);
  });

  test("strips leading/trailing whitespace before parsing", () => {
    const r = parseUrlOrSku("  6587182  ");
    expect(r).toEqual({ ok: true, sku: "6587182" });
  });

  test("ad-URL with alphanumeric product code (no numeric SKU) returns error from sync parser", () => {
    // bestbuy.com/product/{slug}/{ALPHANUMERIC} — no sku/ segment, not a raw SKU
    const r = parseUrlOrSku(
      "https://www.bestbuy.com/product/sony/ABC123DEF",
    );
    expect(r.ok).toBe(false);
  });
});

describe("looksResolvableBestBuyInput", () => {
  test("direct SKU is resolvable", () => {
    expect(looksResolvableBestBuyInput("6587182")).toBe(true);
  });

  test("old URL is resolvable", () => {
    expect(
      looksResolvableBestBuyInput(
        "https://www.bestbuy.com/site/product/6587182.p",
      ),
    ).toBe(true);
  });

  test("bestbuy.com/product/ URL (ad URL) is resolvable", () => {
    expect(
      looksResolvableBestBuyInput(
        "https://www.bestbuy.com/product/sony-wh1000xm5/ABC123",
      ),
    ).toBe(true);
  });

  test("amazon URL is not resolvable", () => {
    expect(
      looksResolvableBestBuyInput("https://www.amazon.com/dp/B09X7CRKRZ"),
    ).toBe(false);
  });

  test("empty string is not resolvable", () => {
    expect(looksResolvableBestBuyInput("")).toBe(false);
  });
});

describe("resolveSkuFromInput", () => {
  test("raw SKU resolves without network", async () => {
    const r = await resolveSkuFromInput("6587182");
    expect(r).toEqual({ ok: true, sku: "6587182" });
  });

  test("old URL resolves without network", async () => {
    const r = await resolveSkuFromInput(
      "https://www.bestbuy.com/site/acer/6587182.p?skuId=6587182",
    );
    expect(r).toEqual({ ok: true, sku: "6587182" });
  });

  test("ad URL that redirects to canonical resolves via final URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      url: "https://www.bestbuy.com/site/product/6587182.p?skuId=6587182",
      text: async () => "<html></html>",
    });
    const r = await resolveSkuFromInput(
      "https://www.bestbuy.com/product/sony/ABC123XYZ",
      { fetchImpl: mockFetch as unknown as typeof fetch },
    );
    expect(r).toEqual({ ok: true, sku: "6587182" });
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  test("ad URL where fetch falls back to HTML canonical link", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      url: "https://www.bestbuy.com/product/sony/ABC123XYZ",
      text: async () =>
        `<html><head><link rel="canonical" href="https://www.bestbuy.com/site/product/6587182.p"></head></html>`,
    });
    const r = await resolveSkuFromInput(
      "https://www.bestbuy.com/product/sony/ABC123XYZ",
      { fetchImpl: mockFetch as unknown as typeof fetch },
    );
    expect(r).toEqual({ ok: true, sku: "6587182" });
  });

  test("ad URL where HTML has JSON-LD sku", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      url: "https://www.bestbuy.com/product/sony/ABC123XYZ",
      text: async () => `<html><body><script type="application/ld+json">{"@type":"Product","sku":"6587182"}</script></body></html>`,
    });
    const r = await resolveSkuFromInput(
      "https://www.bestbuy.com/product/sony/ABC123XYZ",
      { fetchImpl: mockFetch as unknown as typeof fetch },
    );
    expect(r).toEqual({ ok: true, sku: "6587182" });
  });

  test("ad URL where fetch fails returns error with recovery hint", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("network error"));
    const r = await resolveSkuFromInput(
      "https://www.bestbuy.com/product/sony/ABC123XYZ",
      { fetchImpl: mockFetch as unknown as typeof fetch },
    );
    expect(r.ok).toBe(false);
    expect((r as { ok: false; error: string }).error).toMatch(/browser/i);
  });

  test("ad URL where fetch fails can resolve through landingPageResolver", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("network error"));
    const landingPageResolver = vi.fn().mockResolvedValue({
      finalUrl: "https://www.bestbuy.com/product/dell-plus/J3K4L6XF79",
      html: '<script>{"skuId":"10936973"}</script>',
    });
    const r = await resolveSkuFromInput(
      "https://www.bestbuy.com/product/dell-plus/J3K4L6XF79",
      {
        fetchImpl: mockFetch as unknown as typeof fetch,
        landingPageResolver,
      },
    );
    expect(r).toEqual({ ok: true, sku: "10936973" });
    expect(landingPageResolver).toHaveBeenCalledOnce();
  });

  test("non-bestbuy URL returns error without network call", async () => {
    const mockFetch = vi.fn();
    const r = await resolveSkuFromInput("https://amazon.com/dp/B09X7", {
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
    expect(r.ok).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
