/**
 * Tests for Discord webhook payload shapes (SPEC §8 and §19.6).
 *
 * Mocks global `fetch` so no real HTTP goes out; verifies the JSON body
 * passed to the webhook for alert, reminder, test, price-drop, and
 * combined notifications.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sendRestockAlert,
  sendReminder,
  sendTestAlert,
  sendPriceDropAlert,
  sendCombinedAlert,
  type AlertContext,
  type PriceDropContext,
} from "./discord";

const WEBHOOK_URL = "https://discord.com/api/webhooks/test/token";

const baseCtx: AlertContext = {
  sku: "6587182",
  name: "Acer Chromebook 311",
  brand: "Acer",
  currentPriceCents: 15900,
  regularPriceCents: 19900,
  buttonState: "ADD_TO_CART",
  imageUrl: "https://pisces.bbystatic.com/image2/BestBuy_US/images/products/6587/6587182_sd.jpg",
  productUrl: "https://www.bestbuy.com/site/acer/6587182.p",
  cartUrl: "https://www.bestbuy.com/cart?skuId=6587182",
};

let capturedBody: unknown = null;

beforeEach(() => {
  capturedBody = null;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    capturedBody = JSON.parse((init?.body as string) ?? "{}");
    return new Response(null, { status: 204 });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function embed() {
  return (capturedBody as { embeds: unknown[] }).embeds[0] as Record<
    string,
    unknown
  >;
}

// ---------------------------------------------------------------------------
// Restock alert (§8)
// ---------------------------------------------------------------------------

describe("sendRestockAlert", () => {
  test("returns ok:true on 204", async () => {
    const r = await sendRestockAlert(WEBHOOK_URL, baseCtx);
    expect(r.ok).toBe(true);
  });

  test("content is a readable preview with the quick-add link", async () => {
    await sendRestockAlert(WEBHOOK_URL, baseCtx);
    const content = (capturedBody as { content: string }).content;
    expect(content).toContain(`🟢 IN STOCK — ${baseCtx.name}`);
    expect(content).toContain("Price: $159.00 (was $199.00)");
    expect(content).toContain(baseCtx.cartUrl);
  });

  test("embed title starts with IN STOCK", async () => {
    await sendRestockAlert(WEBHOOK_URL, baseCtx);
    expect(String(embed().title)).toContain("IN STOCK");
  });

  test("embed url is the product URL", async () => {
    await sendRestockAlert(WEBHOOK_URL, baseCtx);
    expect(embed().url).toBe(baseCtx.productUrl);
  });

  test("embed fields include Price, SKU, and State", async () => {
    await sendRestockAlert(WEBHOOK_URL, baseCtx);
    const fields = embed().fields as Array<{ name: string; value: string }>;
    const names = fields.map((f) => f.name);
    expect(names).toContain("Price");
    expect(names).toContain("SKU");
    expect(names).toContain("State");
  });

  test("Price field reflects sale price with was-price", async () => {
    await sendRestockAlert(WEBHOOK_URL, baseCtx);
    const fields = embed().fields as Array<{ name: string; value: string }>;
    const price = fields.find((f) => f.name === "Price")!.value;
    expect(price).toContain("$159.00");
    expect(price).toContain("$199.00");
  });

  test("thumbnail url is the imageUrl", async () => {
    await sendRestockAlert(WEBHOOK_URL, baseCtx);
    expect((embed().thumbnail as { url: string }).url).toBe(baseCtx.imageUrl);
  });

  test("custom username passed through", async () => {
    await sendRestockAlert(WEBHOOK_URL, baseCtx, "MyBot");
    expect((capturedBody as { username: string }).username).toBe("MyBot");
  });

  test("note field added when ctx.note is set", async () => {
    await sendRestockAlert(WEBHOOK_URL, { ...baseCtx, note: "Birthday gift" });
    const fields = embed().fields as Array<{ name: string }>;
    expect(fields.some((f) => f.name === "Note")).toBe(true);
  });

  test("returns ok:false with status on non-2xx response", async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 429 }),
    );
    const r = await sendRestockAlert(WEBHOOK_URL, baseCtx);
    expect(r.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Reminder (§8)
// ---------------------------------------------------------------------------

describe("sendReminder", () => {
  test("embed title contains STILL IN STOCK", async () => {
    await sendReminder(WEBHOOK_URL, baseCtx);
    expect(String(embed().title)).toContain("STILL IN STOCK");
  });

  test("footer contains 'reminder'", async () => {
    await sendReminder(WEBHOOK_URL, baseCtx);
    expect(String((embed().footer as { text: string }).text)).toContain(
      "reminder",
    );
  });
});

// ---------------------------------------------------------------------------
// Test notification (§8)
// ---------------------------------------------------------------------------

describe("sendTestAlert", () => {
  test("returns ok:true", async () => {
    const r = await sendTestAlert(WEBHOOK_URL);
    expect(r.ok).toBe(true);
  });

  test("embed title contains TEST", async () => {
    await sendTestAlert(WEBHOOK_URL);
    expect(String(embed().title)).toContain("TEST");
  });
});

// ---------------------------------------------------------------------------
// Price-drop embed (§19.6)
// ---------------------------------------------------------------------------

const priceCtx: PriceDropContext = {
  ...baseCtx,
  priceAlertMode: "target",
  oldPriceCents: 14000, // target
  currentPriceCents: 12999,
};

describe("sendPriceDropAlert — target mode (§19.6)", () => {
  test("embed title contains PRICE TARGET HIT", async () => {
    await sendPriceDropAlert(WEBHOOK_URL, priceCtx);
    expect(String(embed().title)).toContain("PRICE TARGET HIT");
  });

  test("embed has Target field", async () => {
    await sendPriceDropAlert(WEBHOOK_URL, priceCtx);
    const fields = embed().fields as Array<{ name: string }>;
    expect(fields.some((f) => f.name === "Target")).toBe(true);
  });

  test("color is blue (not green) for standalone price alert", async () => {
    await sendPriceDropAlert(WEBHOOK_URL, priceCtx);
    expect(embed().color).toBe(3900150);
  });
});

const dropCtx: PriceDropContext = {
  ...baseCtx,
  priceAlertMode: "drop",
  oldPriceCents: 15900, // previous price
  currentPriceCents: 12999,
};

describe("sendPriceDropAlert — drop mode (§19.6)", () => {
  test("embed title contains PRICE DROP", async () => {
    await sendPriceDropAlert(WEBHOOK_URL, dropCtx);
    expect(String(embed().title)).toContain("PRICE DROP");
  });

  test("embed has Was field", async () => {
    await sendPriceDropAlert(WEBHOOK_URL, dropCtx);
    const fields = embed().fields as Array<{ name: string }>;
    expect(fields.some((f) => f.name === "Was")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Combined embed (stock + price drop, §19.6)
// ---------------------------------------------------------------------------

describe("sendCombinedAlert (§19.6)", () => {
  test("embed title contains IN STOCK and PRICE", async () => {
    await sendCombinedAlert(WEBHOOK_URL, priceCtx);
    const title = String(embed().title);
    expect(title).toContain("IN STOCK");
    expect(title).toContain("PRICE");
  });

  test("color is green for combined (stock+price) alert", async () => {
    await sendCombinedAlert(WEBHOOK_URL, priceCtx);
    expect(embed().color).toBe(5763719);
  });

  test("footer contains both 'stock' and 'target hit' or 'price drop'", async () => {
    await sendCombinedAlert(WEBHOOK_URL, priceCtx);
    const footer = String((embed().footer as { text: string }).text).toLowerCase();
    expect(footer).toContain("stock");
  });
});
