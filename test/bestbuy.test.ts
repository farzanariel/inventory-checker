import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  interpretStock,
  imageUrlForSku,
  cartUrlForSku,
  productUrlForSku,
  fetchProducts,
  fetchProductMetaV2,
  isMissingFromPriceBlocks,
} from "@/lib/bestbuy";

describe("interpretStock", () => {
  it("maps ADD_TO_CART to IN_STOCK", () => {
    expect(interpretStock("ADD_TO_CART")).toBe("IN_STOCK");
  });
  it("maps LOW_STOCK to IN_STOCK", () => {
    expect(interpretStock("LOW_STOCK")).toBe("IN_STOCK");
  });
  it("maps IN_CART to IN_STOCK", () => {
    expect(interpretStock("IN_CART")).toBe("IN_STOCK");
  });
  it("maps CHECK_STORES to OUT_OF_STOCK", () => {
    expect(interpretStock("CHECK_STORES")).toBe("OUT_OF_STOCK");
  });
  it("maps SOLD_OUT_ONLINE to OUT_OF_STOCK", () => {
    expect(interpretStock("SOLD_OUT_ONLINE")).toBe("OUT_OF_STOCK");
  });
  it("maps SOLD_OUT to OUT_OF_STOCK", () => {
    expect(interpretStock("SOLD_OUT")).toBe("OUT_OF_STOCK");
  });
  it("maps COMING_SOON to OUT_OF_STOCK", () => {
    expect(interpretStock("COMING_SOON")).toBe("OUT_OF_STOCK");
  });
  it("maps PRE_ORDER to OUT_OF_STOCK", () => {
    expect(interpretStock("PRE_ORDER")).toBe("OUT_OF_STOCK");
  });
  it("maps undefined to UNKNOWN", () => {
    expect(interpretStock(undefined)).toBe("UNKNOWN");
  });
  it("maps null to UNKNOWN", () => {
    expect(interpretStock(null)).toBe("UNKNOWN");
  });
  it("maps empty string to UNKNOWN", () => {
    expect(interpretStock("")).toBe("UNKNOWN");
  });
  it("maps unrecognized buttonState values to UNKNOWN (does NOT default to IN/OUT)", () => {
    expect(interpretStock("FOOBAR_NOT_A_REAL_STATE")).toBe("UNKNOWN");
    expect(interpretStock("ADD_TO_CART_BUT_TYPO")).toBe("UNKNOWN");
  });
});

describe("URL helpers", () => {
  it("imageUrlForSku produces the canonical CDN URL", () => {
    expect(imageUrlForSku("6587182")).toBe(
      "https://pisces.bbystatic.com/image2/BestBuy_US/images/products/6587/6587182_sd.jpg"
    );
  });

  it("imageUrlForSku is defensive for SKUs <4 digits (uses whole SKU as prefix)", () => {
    expect(imageUrlForSku("123")).toBe(
      "https://pisces.bbystatic.com/image2/BestBuy_US/images/products/123/123_sd.jpg"
    );
  });

  it("cartUrlForSku produces the canonical add-to-cart URL", () => {
    expect(cartUrlForSku("6587182")).toBe(
      "https://www.bestbuy.com/cart?skuId=6587182"
    );
  });

  it("productUrlForSku produces the fallback canonical URL", () => {
    expect(productUrlForSku("6587182")).toBe(
      "https://www.bestbuy.com/site/-/6587182.p?skuId=6587182"
    );
  });
});

describe("fetchProducts", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns an empty Map for empty input (no fetch)", async () => {
    const result = await fetchProducts([]);
    expect(result.size).toBe(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("parses a successful single-SKU response into a ProductResult", async () => {
    const body = [
      {
        sku: {
          brand: { brand: "Acer" },
          buttonState: {
            purchasable: true,
            buttonState: "CHECK_STORES",
            skuId: "6587182",
          },
          names: {
            short: 'Acer - Chromebook 311 - 11.6" HD Laptop - MTK MT8183C - 4GB Memory - 32GB eMMC - Pure Silver',
          },
          price: { currentPrice: 159, regularPrice: 229 },
          skuId: "6587182",
          url: "/site/acer-chromebook-311-pure-silver/6587182.p?skuId=6587182",
        },
      },
    ];

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const result = await fetchProducts(["6587182"]);
    expect(result.size).toBe(1);

    const entry = result.get("6587182");
    expect(entry).toBeDefined();
    expect(entry!.ok).toBe(true);

    if (entry && entry.ok) {
      expect(entry.sku).toBe("6587182");
      expect(entry.name).toContain("Acer - Chromebook 311");
      expect(entry.brand).toBe("Acer");
      expect(entry.currentPriceCents).toBe(15900);
      expect(entry.regularPriceCents).toBe(22900);
      expect(entry.buttonState).toBe("CHECK_STORES");
      expect(entry.purchasable).toBe(true);
      expect(entry.canonicalUrl).toBe(
        "https://www.bestbuy.com/site/acer-chromebook-311-pure-silver/6587182.p?skuId=6587182"
      );
      // Sanity check that buttonState is interpretStock-friendly
      expect(interpretStock(entry.buttonState)).toBe("OUT_OF_STOCK");
    }
  });

  it("converts non-integer prices to cents correctly (rounding)", async () => {
    const body = [
      {
        sku: {
          buttonState: {
            purchasable: true,
            buttonState: "ADD_TO_CART",
            skuId: "1234567",
          },
          names: { short: "Test Product" },
          price: { currentPrice: 19.99, regularPrice: 24.999 },
          skuId: "1234567",
          url: "/site/test/1234567.p?skuId=1234567",
        },
      },
    ];

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify(body), { status: 200 })
    );

    const result = await fetchProducts(["1234567"]);
    const entry = result.get("1234567");
    expect(entry?.ok).toBe(true);
    if (entry && entry.ok) {
      expect(entry.currentPriceCents).toBe(1999);
      // 24.999 * 100 = 2499.9 → rounds to 2500
      expect(entry.regularPriceCents).toBe(2500);
    }
  });

  it("marks a SKU as failed when sku.skuId is missing", async () => {
    const body = [
      {
        sku: {
          // no skuId at all — we can't even map this back to a request
          buttonState: { purchasable: true, buttonState: "ADD_TO_CART" },
          names: { short: "Mystery Product" },
          price: { currentPrice: 100 },
        },
      },
    ];

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify(body), { status: 200 })
    );

    const result = await fetchProducts(["6587182"]);
    const entry = result.get("6587182");
    expect(entry?.ok).toBe(false);
    if (entry && !entry.ok) {
      // Since we couldn't map the response entry back, it falls into "Not found in response"
      expect(entry.error).toBe("Not found in response");
    }
  });

  it("marks a SKU as failed when required fields are missing on a present sku entry", async () => {
    const body = [
      {
        sku: {
          // skuId present, but missing buttonState/name/price
          skuId: "6587182",
          buttonState: { purchasable: true, skuId: "6587182" }, // no buttonState string
          names: { short: "Some Product" },
          price: { currentPrice: 100 },
        },
      },
    ];

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify(body), { status: 200 })
    );

    const result = await fetchProducts(["6587182"]);
    const entry = result.get("6587182");
    expect(entry?.ok).toBe(false);
    if (entry && !entry.ok) {
      expect(entry.error).toBe("Invalid SKU or missing fields");
    }
  });

  it("marks every requested SKU as failed on HTTP 500", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 })
    );

    const result = await fetchProducts(["6587182", "1234567", "9876543"]);
    expect(result.size).toBe(3);
    for (const sku of ["6587182", "1234567", "9876543"]) {
      const entry = result.get(sku);
      expect(entry?.ok).toBe(false);
      if (entry && !entry.ok) {
        expect(entry.error).toBe("HTTP 500");
        expect(entry.sku).toBe(sku);
      }
    }
  });

  it("handles a multi-SKU batch where one is missing from the response", async () => {
    const body = [
      {
        sku: {
          buttonState: {
            purchasable: true,
            buttonState: "ADD_TO_CART",
            skuId: "1111111",
          },
          names: { short: "Product A" },
          price: { currentPrice: 10 },
          skuId: "1111111",
          url: "/site/a/1111111.p?skuId=1111111",
        },
      },
      {
        sku: {
          buttonState: {
            purchasable: false,
            buttonState: "SOLD_OUT",
            skuId: "2222222",
          },
          names: { short: "Product B" },
          price: { currentPrice: 20 },
          skuId: "2222222",
          url: "/site/b/2222222.p?skuId=2222222",
        },
      },
    ];

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify(body), { status: 200 })
    );

    const result = await fetchProducts(["1111111", "2222222", "3333333"]);
    expect(result.size).toBe(3);

    const a = result.get("1111111");
    const b = result.get("2222222");
    const c = result.get("3333333");

    expect(a?.ok).toBe(true);
    expect(b?.ok).toBe(true);
    expect(c?.ok).toBe(false);
    if (c && !c.ok) {
      expect(c.error).toBe("Not found in response");
      expect(c.sku).toBe("3333333");
    }
  });

  it("sends the comma-joined SKUs in the URL and includes all four required headers", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 })
    );

    await fetchProducts(["1111111", "2222222", "3333333"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [calledUrl, calledOpts] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(
      "https://www.bestbuy.com/api/3.0/priceBlocks?skus=1111111,2222222,3333333"
    );

    const headers = (calledOpts as RequestInit).headers as Record<string, string>;
    expect(headers["User-Agent"]).toContain("Chrome/131");
    expect(headers["User-Agent"]).toContain("Mozilla/5.0");
    expect(headers["Accept"]).toBe("application/json");
    expect(headers["Accept-Language"]).toBe("en-US,en;q=0.9");
    expect(headers["Referer"]).toBe("https://www.bestbuy.com/");

    // Also confirm a timeout signal is supplied
    expect((calledOpts as RequestInit).signal).toBeDefined();
  });

  it("falls back to productUrlForSku when API entry has no url field", async () => {
    const body = [
      {
        sku: {
          buttonState: {
            purchasable: true,
            buttonState: "ADD_TO_CART",
            skuId: "6587182",
          },
          names: { short: "Acer Chromebook" },
          price: { currentPrice: 159 },
          skuId: "6587182",
          // no url field
        },
      },
    ];

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify(body), { status: 200 })
    );

    const result = await fetchProducts(["6587182"]);
    const entry = result.get("6587182");
    expect(entry?.ok).toBe(true);
    if (entry && entry.ok) {
      expect(entry.canonicalUrl).toBe(
        "https://www.bestbuy.com/site/-/6587182.p?skuId=6587182"
      );
    }
  });

  it("surfaces a concise error when priceBlocks returns ProductNotFoundException", async () => {
    const body = [
      {
        sku: {
          skuId: "6587182",
          error: "com.bestbuy.api.exceptions.ProductNotFoundException: product not found",
        },
      },
    ];

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify(body), { status: 200 })
    );

    const result = await fetchProducts(["6587182"]);
    const entry = result.get("6587182");
    expect(entry?.ok).toBe(false);
    if (entry && !entry.ok) {
      expect(isMissingFromPriceBlocks(entry.error)).toBe(true);
      expect(entry.error).toContain("doesn't recognize this SKU");
    }
  });
});

describe("fetchProductMetaV2", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns metadata when v2 endpoint includes required fields", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          skuId: "1234567",
          brand: "BrandX",
          names: { short: "Widget Pro" },
          links: {
            skuSpecificUrl: {
              href: "https://www.bestbuy.com/site/widget-pro/1234567.p?skuId=1234567",
            },
          },
        }),
        { status: 200 }
      )
    );

    const result = await fetchProductMetaV2("1234567");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sku).toBe("1234567");
      expect(result.name).toBe("Widget Pro");
      expect(result.brand).toBe("BrandX");
      expect(result.canonicalUrl).toContain("bestbuy.com/site/widget-pro");
    }
  });
});
