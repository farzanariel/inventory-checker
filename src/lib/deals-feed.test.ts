/**
 * Unit tests for the deals.json key parser + BB SKU extractor (SPEC §22.9).
 */
import { describe, expect, test } from "vitest";

import {
  bbSkusFromOffer,
  displayNameForSource,
  extractBestBuySkuFromUrl,
  homepageUrlForSource,
  parseDealKey,
} from "./deals-feed";

describe("parseDealKey", () => {
  test("upc-only key", () => {
    const out = parseDealKey("upc:850049670302");
    expect(out.upc).toBe("850049670302");
    expect(out.model).toBeUndefined();
  });

  test("model+upc key", () => {
    expect(parseDealKey("model:2535001,upc:850049670302")).toMatchObject({
      model: "2535001",
      upc: "850049670302",
    });
  });

  test("model-only key", () => {
    const out = parseDealKey("model:MEUX4LW/A");
    expect(out.model).toBe("MEUX4LW/A");
    expect(out.upc).toBeUndefined();
  });

  test("source-opaque key (dealandrunner uuid) yields no upc/model", () => {
    const out = parseDealKey("dealandrunner:21a3468b-0ffe-4739-ad6f-208cf10538c8");
    expect(out.upc).toBeUndefined();
    expect(out.model).toBeUndefined();
    expect(out.raw).toMatch(/^dealandrunner:/);
  });

  test("multi-model picks the first model", () => {
    expect(parseDealKey("model:A,model:B,upc:123")).toMatchObject({
      model: "A",
      upc: "123",
    });
  });

  test("empty/garbage tolerated", () => {
    expect(parseDealKey("")).toEqual({ raw: "" });
    expect(parseDealKey("nonsense")).toEqual({ raw: "nonsense" });
    expect(parseDealKey("upc:")).toEqual({ raw: "upc:" });
  });
});

describe("extractBestBuySkuFromUrl", () => {
  test("new URL /sku/N", () => {
    expect(
      extractBestBuySkuFromUrl(
        "https://www.bestbuy.com/product/widget/sku/6587410",
      ),
    ).toBe("6587410");
  });

  test("old URL N.p", () => {
    expect(
      extractBestBuySkuFromUrl(
        "https://www.bestbuy.com/site/widget/6587410.p?skuId=6587410",
      ),
    ).toBe("6587410");
  });

  test("skuId query param", () => {
    expect(
      extractBestBuySkuFromUrl(
        "https://www.bestbuy.com/site/widget?skuId=1234567",
      ),
    ).toBe("1234567");
  });

  test("non-BB url ignored", () => {
    expect(
      extractBestBuySkuFromUrl("https://www.homedepot.com/pep/sku/6587410"),
    ).toBeNull();
  });

  test("BB url without SKU returns null", () => {
    expect(
      extractBestBuySkuFromUrl(
        "https://www.bestbuy.com/product/foo/J3R8ZC259C",
      ),
    ).toBeNull();
  });
});

describe("bbSkusFromOffer", () => {
  test("dedupes across productList[].links", () => {
    const skus = bbSkusFromOffer({
      productList: [
        {
          links: [
            { url: "https://www.bestbuy.com/site/x/6587410.p" },
            { url: "https://www.bestbuy.com/product/y/sku/9999999" },
            { url: "https://homedepot.com/sku/0000000" },
          ],
        },
      ],
    });
    expect(skus).toEqual(["6587410", "9999999"]);
  });

  test("empty offer", () => {
    expect(bbSkusFromOffer({})).toEqual([]);
  });
});

describe("displayNameForSource / homepageUrlForSource", () => {
  test("known sources resolve to hand-curated names regardless of aggregator", () => {
    expect(displayNameForSource("buyformeretail:bfmr.com")).toBe("BFMR");
    expect(displayNameForSource("sellerspeed:powerbuynetwork.com")).toBe(
      "PowerBuyNetwork",
    );
    expect(displayNameForSource("sellerspeed:bfmr.com")).toBe("BFMR");
  });

  test("unknown sources derive a name from the domain stem", () => {
    expect(displayNameForSource("foo:somenewgroup.com")).toBe("Somenewgroup");
    expect(displayNameForSource("foo:some-new-group.com")).toBe("SomeNewGroup");
  });

  test("homepage url derived from domain tail", () => {
    expect(homepageUrlForSource("buyformeretail:bfmr.com")).toBe(
      "https://bfmr.com",
    );
    expect(homepageUrlForSource("sellerspeed:maxoutdeals.com")).toBe(
      "https://maxoutdeals.com",
    );
  });

  test("opaque source returns null homepage", () => {
    expect(homepageUrlForSource("dealandrunner:21a3468b-uuid")).toBeNull();
  });
});
