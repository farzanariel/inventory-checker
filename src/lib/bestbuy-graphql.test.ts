import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTlsJsonGet = vi.hoisted(() => vi.fn());

vi.mock("./bestbuy-tls", () => ({
  tlsJsonGet: mockTlsJsonGet,
}));

import {
  fetchProductDetailsViaGraphql,
  mergeProductDetailsIntoResult,
} from "./bestbuy-graphql";
import type { ProductResult } from "./bestbuy";

describe("fetchProductDetailsViaGraphql", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses live product metadata from GraphQL GET", async () => {
    mockTlsJsonGet.mockResolvedValueOnce({
      statusCode: 200,
      body: JSON.stringify({
        data: {
          productBySkuId: {
            skuId: "6674708",
            brand: "Lenovo",
            name: { short: "Lenovo IdeaPad" },
            primaryImage: { piscesHref: "https://pisces.bbystatic.com/image.jpg" },
            buyingOptions: [
              {
                type: "New",
                pdpUrl: "https://www.bestbuy.com/product/lenovo/JJGH3KQYP8/sku/6674708",
              },
            ],
            price: {
              currentPrice: 599.99,
              regularPrice: 899.99,
            },
          },
        },
      }),
    });

    const results = await fetchProductDetailsViaGraphql(["6674708"]);
    const result = results.get("6674708");

    expect(result?.ok).toBe(true);
    if (result?.ok) {
      expect(result.name).toBe("Lenovo IdeaPad");
      expect(result.brand).toBe("Lenovo");
      expect(result.currentPriceCents).toBe(59999);
      expect(result.regularPriceCents).toBe(89999);
      expect(result.imageUrl).toBe("https://pisces.bbystatic.com/image.jpg");
      expect(result.canonicalUrl).toBe(
        "https://www.bestbuy.com/product/lenovo/JJGH3KQYP8/sku/6674708",
      );
    }

    const url = mockTlsJsonGet.mock.calls[0][0] as string;
    expect(url).toContain("/gateway/graphql?");
    expect(url).toContain("operationName=getProduct");
    expect(JSON.parse(new URL(url).searchParams.get("variables") ?? "{}")).toEqual({
      skuId: "6674708",
    });
  });

  it("returns an error on missing price", async () => {
    mockTlsJsonGet.mockResolvedValueOnce({
      statusCode: 200,
      body: JSON.stringify({
        data: {
          productBySkuId: {
            skuId: "6674708",
            name: { short: "Lenovo IdeaPad" },
            price: null,
          },
        },
      }),
    });

    const result = (await fetchProductDetailsViaGraphql(["6674708"])).get("6674708");
    expect(result?.ok).toBe(false);
    if (!result?.ok) expect(result?.error).toContain("incomplete product");
  });

  it("retries transient HTTP failures once", async () => {
    mockTlsJsonGet
      .mockResolvedValueOnce({
        statusCode: 503,
        body: "Service Unavailable",
      })
      .mockResolvedValueOnce({
        statusCode: 200,
        body: JSON.stringify({
          data: {
            productBySkuId: {
              skuId: "6674708",
              name: { short: "Lenovo IdeaPad" },
              price: { currentPrice: 599.99 },
            },
          },
        }),
      });

    const result = (await fetchProductDetailsViaGraphql(["6674708"])).get("6674708");

    expect(mockTlsJsonGet).toHaveBeenCalledTimes(2);
    expect(result?.ok).toBe(true);
  });
});

describe("mergeProductDetailsIntoResult", () => {
  it("preserves fulfillment stock while replacing stale metadata", () => {
    const stock: ProductResult = {
      ok: true,
      sku: "6674708",
      name: "SKU 6674708",
      currentPriceCents: 0,
      buttonState: "ADD_TO_CART",
      purchasable: true,
      canonicalUrl: "https://www.bestbuy.com/site/-/6674708.p?skuId=6674708",
    };

    const merged = mergeProductDetailsIntoResult(stock, {
      ok: true,
      sku: "6674708",
      name: "Lenovo IdeaPad",
      brand: "Lenovo",
      currentPriceCents: 59999,
      regularPriceCents: 89999,
      imageUrl: "https://pisces.bbystatic.com/image.jpg",
      canonicalUrl: "https://www.bestbuy.com/product/lenovo/JJGH3KQYP8/sku/6674708",
    });

    expect(merged.ok).toBe(true);
    if (merged.ok) {
      expect(merged.buttonState).toBe("ADD_TO_CART");
      expect(merged.purchasable).toBe(true);
      expect(merged.name).toBe("Lenovo IdeaPad");
      expect(merged.currentPriceCents).toBe(59999);
      expect(merged.imageUrl).toBe("https://pisces.bbystatic.com/image.jpg");
    }
  });
});
