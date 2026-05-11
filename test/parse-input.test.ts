import { describe, it, expect, vi } from "vitest";
import {
  looksResolvableBestBuyInput,
  parseUrlOrSku,
  resolveSkuFromInput,
} from "@/lib/parse-input";

// NEC-13 fixture: the exact URL the user reported from a Best Buy ad
// landing page, where the path code is alphanumeric and the SKU only
// appears in the page HTML (not the URL).
const NEC13_URL =
  "https://www.bestbuy.com/product/acer-aspire-lite-15-laptop-15-6-fhd-ips-intel-core-3-series-1-n350-intel-graphics-8gb-onboard-128gb-pcie-ssd-light-silver/JJ8V8H8627?utm_account=admedia&clickID=20260511084058434335106042&utm_campaign=Search_25_123331_BestBuy&ref=212&loc=ADM191";
const NEC13_SKU = "6663816";

function mockResponse({
  body,
  status = 200,
  url,
}: {
  body: string;
  status?: number;
  url?: string;
}): Response {
  const response = new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
  if (url) {
    Object.defineProperty(response, "url", { value: url, configurable: true });
  }
  return response;
}

describe("parseUrlOrSku", () => {
  it("extracts SKU from new URL format with slug", () => {
    const result = parseUrlOrSku(
      "https://www.bestbuy.com/product/acer-chromebook-311-laptop/sku/6587182"
    );
    expect(result).toEqual({ ok: true, sku: "6587182" });
  });

  it("extracts SKU from old URL with skuId query param", () => {
    const result = parseUrlOrSku(
      "https://www.bestbuy.com/site/acer-chromebook-311-star-black/6587182.p?skuId=6587182"
    );
    expect(result).toEqual({ ok: true, sku: "6587182" });
  });

  it("extracts SKU from old URL with .p only (no skuId param)", () => {
    const result = parseUrlOrSku(
      "https://www.bestbuy.com/site/acer-chromebook-311/6587182.p"
    );
    expect(result).toEqual({ ok: true, sku: "6587182" });
  });

  it("accepts a raw 7-digit SKU", () => {
    const result = parseUrlOrSku("6587182");
    expect(result).toEqual({ ok: true, sku: "6587182" });
  });

  it("accepts a raw 6-digit SKU", () => {
    const result = parseUrlOrSku("123456");
    expect(result).toEqual({ ok: true, sku: "123456" });
  });

  it("accepts a raw 8-digit SKU", () => {
    const result = parseUrlOrSku("12345678");
    expect(result).toEqual({ ok: true, sku: "12345678" });
  });

  it("trims whitespace around input", () => {
    const result = parseUrlOrSku("   6587182\n  ");
    expect(result).toEqual({ ok: true, sku: "6587182" });
  });

  it("rejects garbage strings", () => {
    const result = parseUrlOrSku("hello world this is not a url");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
    }
  });

  it("rejects an empty string", () => {
    const result = parseUrlOrSku("");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
    }
  });

  it("rejects whitespace-only input", () => {
    const result = parseUrlOrSku("   \t  \n");
    expect(result.ok).toBe(false);
  });

  it("works with URLs that have extra query params", () => {
    const result = parseUrlOrSku(
      "https://www.bestbuy.com/site/acer-chromebook-311/6587182.p?skuId=6587182&ref=212&loc=us&intl=nosplash"
    );
    expect(result).toEqual({ ok: true, sku: "6587182" });
  });

  it("works with new URL format plus extra query params", () => {
    const result = parseUrlOrSku(
      "https://www.bestbuy.com/product/acer-chromebook/sku/6587182?ref=email&utm_source=foo"
    );
    expect(result).toEqual({ ok: true, sku: "6587182" });
  });

  it("rejects 4-digit numeric input (too short)", () => {
    const result = parseUrlOrSku("1234");
    expect(result.ok).toBe(false);
  });

  it("rejects 5-digit numeric input (too short)", () => {
    const result = parseUrlOrSku("12345");
    expect(result.ok).toBe(false);
  });

  it("rejects 9-digit numeric input (too long)", () => {
    const result = parseUrlOrSku("123456789");
    expect(result.ok).toBe(false);
  });

  it("works with http (not just https)", () => {
    const result = parseUrlOrSku(
      "http://www.bestbuy.com/site/something/6587182.p?skuId=6587182"
    );
    expect(result).toEqual({ ok: true, sku: "6587182" });
  });

  it("prefers /sku/ match over other patterns when both present", () => {
    // contrived: new URL format should win even if a number appears elsewhere
    const result = parseUrlOrSku(
      "https://www.bestbuy.com/product/foo/sku/6587182?ref=999999"
    );
    expect(result).toEqual({ ok: true, sku: "6587182" });
  });

  it("rejects the NEC-13 /product/{slug}/{ALPHANUMERIC} URL synchronously (no SKU in URL)", () => {
    // The fix path is `resolveSkuFromInput`, not `parseUrlOrSku`. This test
    // documents that the sync parser correctly declines so callers know to
    // fall through to the async resolver.
    const result = parseUrlOrSku(NEC13_URL);
    expect(result.ok).toBe(false);
  });
});

describe("looksResolvableBestBuyInput", () => {
  it("accepts a raw SKU", () => {
    expect(looksResolvableBestBuyInput("6587182")).toBe(true);
  });

  it("accepts a /site/.../{sku}.p URL", () => {
    expect(
      looksResolvableBestBuyInput(
        "https://www.bestbuy.com/site/foo/6587182.p?skuId=6587182"
      )
    ).toBe(true);
  });

  it("accepts a /product/{slug}/{ALPHANUMERIC} URL (resolvable via fetch)", () => {
    expect(looksResolvableBestBuyInput(NEC13_URL)).toBe(true);
  });

  it("rejects empty input", () => {
    expect(looksResolvableBestBuyInput("")).toBe(false);
    expect(looksResolvableBestBuyInput("   ")).toBe(false);
  });

  it("rejects unrelated URLs", () => {
    expect(looksResolvableBestBuyInput("https://amazon.com/dp/B0XYZ")).toBe(
      false
    );
  });
});

describe("resolveSkuFromInput", () => {
  it("short-circuits without fetching when parseUrlOrSku already matches", async () => {
    const fetchImpl = vi.fn();
    const result = await resolveSkuFromInput(
      "https://www.bestbuy.com/site/foo/6587182.p?skuId=6587182",
      { fetchImpl }
    );
    expect(result).toEqual({ ok: true, sku: "6587182" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("short-circuits on a raw SKU", async () => {
    const fetchImpl = vi.fn();
    const result = await resolveSkuFromInput("6587182", { fetchImpl });
    expect(result).toEqual({ ok: true, sku: "6587182" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("resolves NEC-13 URL via canonical link in HTML", async () => {
    const html = `
      <!doctype html>
      <html>
        <head>
          <title>Acer Aspire Lite 15 Laptop</title>
          <link rel="canonical" href="https://www.bestbuy.com/site/acer-aspire-lite-15/${NEC13_SKU}.p?skuId=${NEC13_SKU}" />
        </head>
        <body>...</body>
      </html>
    `;
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(mockResponse({ body: html, url: NEC13_URL }));
    const result = await resolveSkuFromInput(NEC13_URL, { fetchImpl });
    expect(result).toEqual({ ok: true, sku: NEC13_SKU });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOpts] = fetchImpl.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(calledUrl).toBe(NEC13_URL);
    expect(calledOpts.redirect).toBe("follow");
    expect((calledOpts.headers as Record<string, string>)["User-Agent"]).toMatch(
      /Mozilla/
    );
    expect((calledOpts.headers as Record<string, string>).Referer).toBe(
      "https://www.bestbuy.com/"
    );
  });

  it("resolves via og:url when canonical is absent", async () => {
    const html = `
      <html><head>
        <meta property="og:url" content="https://www.bestbuy.com/site/-/${NEC13_SKU}.p?skuId=${NEC13_SKU}">
      </head></html>
    `;
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(mockResponse({ body: html, url: NEC13_URL }));
    const result = await resolveSkuFromInput(NEC13_URL, { fetchImpl });
    expect(result).toEqual({ ok: true, sku: NEC13_SKU });
  });

  it("resolves via JSON-LD sku when canonical and og:url are absent", async () => {
    const html = `
      <html><body>
        <script type="application/ld+json">{"@type":"Product","sku":"${NEC13_SKU}","name":"foo"}</script>
      </body></html>
    `;
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(mockResponse({ body: html, url: NEC13_URL }));
    const result = await resolveSkuFromInput(NEC13_URL, { fetchImpl });
    expect(result).toEqual({ ok: true, sku: NEC13_SKU });
  });

  it("resolves via final URL when Best Buy redirects to /site/.../{sku}.p", async () => {
    const html = "<html></html>"; // no SKU in body — final URL is enough
    const finalUrl = `https://www.bestbuy.com/site/acer-aspire-lite-15/${NEC13_SKU}.p?skuId=${NEC13_SKU}`;
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(mockResponse({ body: html, url: finalUrl }));
    const result = await resolveSkuFromInput(NEC13_URL, { fetchImpl });
    expect(result).toEqual({ ok: true, sku: NEC13_SKU });
  });

  it("returns a clear error when the page has no extractable SKU", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        mockResponse({ body: "<html><body>no sku here</body></html>", url: NEC13_URL })
      );
    const result = await resolveSkuFromInput(NEC13_URL, { fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Could not extract a Best Buy SKU/);
    }
  });

  it("returns a clear error when the upstream request fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ETIMEDOUT"));
    const result = await resolveSkuFromInput(NEC13_URL, { fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Could not reach Best Buy/);
      expect(result.error).toMatch(/ETIMEDOUT/);
    }
  });

  it("returns a clear error on non-2xx", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(mockResponse({ body: "", status: 503, url: NEC13_URL }));
    const result = await resolveSkuFromInput(NEC13_URL, { fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/HTTP 503/);
    }
  });

  it("does NOT hit the network for non-bestbuy garbage", async () => {
    const fetchImpl = vi.fn();
    const result = await resolveSkuFromInput("hello world", { fetchImpl });
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does NOT hit the network for non-bestbuy URLs", async () => {
    const fetchImpl = vi.fn();
    const result = await resolveSkuFromInput(
      "https://amazon.com/dp/B0XYZ",
      { fetchImpl }
    );
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
