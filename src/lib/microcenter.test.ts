import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  parseMicroCenterHtml,
  microcenterPdpUrl,
  microcenterImageUrl,
} from "@/lib/microcenter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(__dirname, "../../test/fixtures");

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES, name), "utf8");
}

describe("parseMicroCenterHtml — Mac mini (all OOS)", () => {
  const html = loadFixture("mc-mac-mini-688173.html");
  const result = parseMicroCenterHtml(html, "688173");

  it("parses successfully", () => {
    expect(result.ok).toBe(true);
  });
  it("yields 32 store entries", () => {
    if (!result.ok) throw new Error("expected ok");
    expect(result.stores).toHaveLength(32);
  });
  it("reports zero in-stock stores", () => {
    if (!result.ok) throw new Error("expected ok");
    expect(result.stores.filter((s) => s.qoh > 0)).toHaveLength(0);
  });
  it("includes Shippable Items store 029", () => {
    if (!result.ok) throw new Error("expected ok");
    expect(result.stores.find((s) => s.storeNumber === "029")).toMatchObject({
      storeName: "Shippable Items",
      qoh: 0,
    });
  });
  it("extracts price in cents from #pricing[content]", () => {
    if (!result.ok) throw new Error("expected ok");
    expect(result.currentPriceCents).toBe(59999);
  });
  it("extracts product fields from JSON-LD", () => {
    if (!result.ok) throw new Error("expected ok");
    expect(result.name).toBe("Apple Mac mini M4 (16GB RAM, 256GB SSD)");
    expect(result.brand).toBe("Apple");
    expect(result.imageUrl).toBe(
      "https://productimages.microcenter.com/688173_xyz.jpg",
    );
    expect(result.canonicalUrl).toBe(
      "https://www.microcenter.com/product/688173/x",
    );
    expect(result.mcProductId).toBe("688173");
  });
});

describe("parseMicroCenterHtml — MacBook Air (some in stock)", () => {
  const html = loadFixture("mc-macbook-air-708467.html");
  const result = parseMicroCenterHtml(html, "708467");

  it("parses successfully", () => {
    expect(result.ok).toBe(true);
  });
  it("yields 32 store entries", () => {
    if (!result.ok) throw new Error("expected ok");
    expect(result.stores).toHaveLength(32);
  });
  it("reports five in-stock stores", () => {
    if (!result.ok) throw new Error("expected ok");
    const inStock = result.stores.filter((s) => s.qoh > 0);
    expect(inStock).toHaveLength(5);
    expect(inStock.map((s) => s.storeNumber).sort()).toEqual([
      "029",
      "055",
      "075",
      "131",
      "205",
    ]);
  });
  it("preserves qoh counts", () => {
    if (!result.ok) throw new Error("expected ok");
    const dallas = result.stores.find((s) => s.storeNumber === "131");
    expect(dallas?.qoh).toBe(1);
    const westmont = result.stores.find((s) => s.storeNumber === "075");
    expect(westmont?.qoh).toBe(3);
  });
  it("picks Product JSON-LD past Organization/BreadcrumbList blocks", () => {
    if (!result.ok) throw new Error("expected ok");
    expect(result.name).toContain("MacBook Air");
    expect(result.brand).toBe("Apple");
    // image[0] (first entry) when array
    expect(result.imageUrl).toBe(
      "https://productimages.microcenter.com/708467_abc.jpg",
    );
  });
  it("extracts price in cents", () => {
    if (!result.ok) throw new Error("expected ok");
    expect(result.currentPriceCents).toBe(99900);
  });
});

describe("parseMicroCenterHtml — error cases", () => {
  it("returns ok:false when inventory block is missing", () => {
    const html =
      `<html><head><title>x</title>` +
      `<script type="application/ld+json">{"@type":"Product","name":"n","offers":{"price":"1.00"}}</script>` +
      `</head><body><span id="pricing" content="1.00"></span></body></html>`;
    const r = parseMicroCenterHtml(html, "111111");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("inventory block not found");
    expect(r.mcProductId).toBe("111111");
  });

  it("returns ok:false when price is missing from both sources", () => {
    const html =
      `<html><head><title>x</title>` +
      `<script type="application/ld+json">{"@type":"Product","name":"n"}</script>` +
      `</head><body>` +
      `<script>var inventory = [{"qoh":0,"storeNumber":"029","storeName":"Shippable Items","productId":1}];</script>` +
      `</body></html>`;
    const r = parseMicroCenterHtml(html, "222222");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("price not found");
  });

  it("detects Cloudflare 'Just a moment...' challenge page", () => {
    const html =
      `<!DOCTYPE html><html><head><title>Just a moment...</title></head>` +
      `<body><h1>Checking your browser</h1></body></html>`;
    const r = parseMicroCenterHtml(html, "333333");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("Bot detection page (Cloudflare challenge)");
  });

  it("returns ok:false on malformed inventory JSON", () => {
    const html =
      `<html><body>` +
      `<span id="pricing" content="1.00"></span>` +
      `<script>var inventory = [not json];</script>` +
      `</body></html>`;
    const r = parseMicroCenterHtml(html, "444444");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // Could be inventory parse failed OR inventory block not found depending
    // on how the lazy regex chops at the first `]`; both are valid errors.
    expect(r.error).toMatch(/inventory/);
  });
});

describe("parseMicroCenterHtml — UPC extraction", () => {
  function withInventoryAndPrice(extraHead: string, extraBody = ""): string {
    return (
      `<html><head>${extraHead}</head><body>` +
      `<span id="pricing" content="1.00"></span>` +
      `<script>var inventory = [{"qoh":0,"storeNumber":"029","storeName":"Shippable Items","productId":1}];</script>` +
      `${extraBody}</body></html>`
    );
  }

  it("extracts UPC from JSON-LD gtin12", () => {
    const html = withInventoryAndPrice(
      `<script type="application/ld+json">${JSON.stringify({
        "@type": "Product",
        name: "n",
        gtin12: "012345678905",
        offers: { price: "1.00" },
      })}</script>`,
    );
    const r = parseMicroCenterHtml(html, "555555");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.upc).toBe("012345678905");
  });

  it("accepts numeric gtin (JSON-LD shipped as number)", () => {
    const html = withInventoryAndPrice(
      `<script type="application/ld+json">{"@type":"Product","name":"n","gtin":12345678,"offers":{"price":"1.00"}}</script>`,
    );
    const r = parseMicroCenterHtml(html, "555556");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.upc).toBe("12345678");
  });

  it("falls back to the spec table when JSON-LD lacks gtin", () => {
    const html = withInventoryAndPrice(
      `<script type="application/ld+json">${JSON.stringify({
        "@type": "Product",
        name: "n",
        offers: { price: "1.00" },
      })}</script>`,
      `<table class="specs"><tr><td>UPC</td><td>850049670302</td></tr></table>`,
    );
    const r = parseMicroCenterHtml(html, "555557");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.upc).toBe("850049670302");
  });

  it("supports definition-list spec layout", () => {
    const html = withInventoryAndPrice(
      `<script type="application/ld+json">{"@type":"Product","name":"n","offers":{"price":"1.00"}}</script>`,
      `<dl><dt>UPC</dt><dd>012345678905</dd></dl>`,
    );
    const r = parseMicroCenterHtml(html, "555558");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.upc).toBe("012345678905");
  });

  it("supports Micro Center's product-summary UPC label", () => {
    const html = withInventoryAndPrice(
      `<script type="application/ld+json">{"@type":"Product","name":"n","offers":{"price":"1.00"}}</script>`,
      `<div class="product-details">
        <span>SKU: 776963</span>
        <span>Mfr Part #: MU9D3LL/A</span>
        <span>UPC: 195949080296</span>
      </div>`,
    );
    const r = parseMicroCenterHtml(html, "776963");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.upc).toBe("195949080296");
  });

  it("omits upc when no source carries one", () => {
    const html = withInventoryAndPrice(
      `<script type="application/ld+json">{"@type":"Product","name":"n","offers":{"price":"1.00"}}</script>`,
    );
    const r = parseMicroCenterHtml(html, "555559");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.upc).toBeUndefined();
  });
});

describe("microcenterPdpUrl", () => {
  it("returns base URL without storeNumber", () => {
    expect(microcenterPdpUrl("688173")).toBe(
      "https://www.microcenter.com/product/688173/x",
    );
  });
  it("appends storeid when provided", () => {
    expect(microcenterPdpUrl("688173", "131")).toBe(
      "https://www.microcenter.com/product/688173/x?storeid=131",
    );
  });
  it("handles store 029 (Shippable Items)", () => {
    expect(microcenterPdpUrl("708467", "029")).toBe(
      "https://www.microcenter.com/product/708467/x?storeid=029",
    );
  });
});

describe("microcenterImageUrl", () => {
  it("returns undefined without sku", () => {
    expect(microcenterImageUrl("688173")).toBeUndefined();
  });
  it("builds CDN URL when sku provided", () => {
    expect(microcenterImageUrl("688173", "xyz")).toBe(
      "https://productimages.microcenter.com/688173_xyz.jpg",
    );
  });
});
