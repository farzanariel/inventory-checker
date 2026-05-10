import { describe, it, expect } from "vitest";
import { parseUrlOrSku } from "@/lib/parse-input";

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
});
