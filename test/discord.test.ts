import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatPrice,
  sendCombinedAlert,
  sendPriceDropAlert,
  sendReminder,
  sendRestockAlert,
  sendTestAlert,
  type AlertContext,
  type PriceDropContext,
} from "@/lib/discord";

const WEBHOOK_URL = "https://discord.com/api/webhooks/1234/abcd";

const baseCtx: AlertContext = {
  sku: "6587182",
  name: "Acer Chromebook 311",
  brand: "Acer",
  currentPriceCents: 15999,
  regularPriceCents: 19999,
  buttonState: "ADD_TO_CART",
  imageUrl: "https://pisces.bbystatic.com/image2/BestBuy_US/images/products/6587/6587182_sd.jpg",
  productUrl: "https://www.bestbuy.com/site/acer-chromebook/6587182.p?skuId=6587182",
  cartUrl: "https://www.bestbuy.com/cart?skuId=6587182",
};

function mockOkResponse(status = 204): Response {
  return new Response(null, { status });
}

function mockErrorResponse(status: number): Response {
  return new Response(null, { status });
}

function getCallBody(fetchMock: ReturnType<typeof vi.fn>): unknown {
  const call = fetchMock.mock.calls[0];
  const init = call[1] as RequestInit;
  return JSON.parse(init.body as string);
}

type EmbedShape = {
  title: string;
  url: string;
  color: number;
  thumbnail: { url: string };
  fields: Array<{ name: string; value: string; inline?: boolean }>;
  footer: { text: string };
  timestamp: string;
};

type PayloadShape = {
  username: string;
  content: string;
  embeds: EmbedShape[];
};

describe("formatPrice", () => {
  it("formats a basic price without a regular price", () => {
    expect(formatPrice(15999)).toBe("$159.99");
  });

  it("formats prices with thousands separators", () => {
    expect(formatPrice(149999)).toBe("$1,499.99");
  });

  it('appends "(was $Y.YY)" when regular price is greater than current', () => {
    expect(formatPrice(15999, 19999)).toBe("$159.99 (was $199.99)");
  });

  it("omits regular price when equal to current", () => {
    expect(formatPrice(15999, 15999)).toBe("$159.99");
  });

  it("omits regular price when less than current", () => {
    expect(formatPrice(15999, 9999)).toBe("$159.99");
  });

  it("omits regular price when undefined", () => {
    expect(formatPrice(15999, undefined)).toBe("$159.99");
  });

  it("formats $1,499.99 with comma when regular price is also large", () => {
    expect(formatPrice(149999, 199999)).toBe("$1,499.99 (was $1,999.99)");
  });
});

describe("sendRestockAlert", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(mockOkResponse());
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to the webhook URL with application/json content type", async () => {
    await sendRestockAlert(WEBHOOK_URL, baseCtx);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(WEBHOOK_URL);
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it('uses "🟢 IN STOCK —" as the embed title prefix', async () => {
    await sendRestockAlert(WEBHOOK_URL, baseCtx);
    const body = getCallBody(fetchMock) as PayloadShape;
    expect(body.embeds[0].title).toContain("🟢 IN STOCK —");
    expect(body.embeds[0].title).toContain(baseCtx.name);
  });

  it("sets content equal to ctx.cartUrl", async () => {
    await sendRestockAlert(WEBHOOK_URL, baseCtx);
    const body = getCallBody(fetchMock) as PayloadShape;
    expect(body.content).toBe(baseCtx.cartUrl);
  });

  it("sets embeds[0].thumbnail.url equal to ctx.imageUrl", async () => {
    await sendRestockAlert(WEBHOOK_URL, baseCtx);
    const body = getCallBody(fetchMock) as PayloadShape;
    expect(body.embeds[0].thumbnail.url).toBe(baseCtx.imageUrl);
  });

  it("sets embeds[0].url equal to ctx.productUrl", async () => {
    await sendRestockAlert(WEBHOOK_URL, baseCtx);
    const body = getCallBody(fetchMock) as PayloadShape;
    expect(body.embeds[0].url).toBe(baseCtx.productUrl);
  });

  it("includes Price, SKU, and State fields", async () => {
    await sendRestockAlert(WEBHOOK_URL, baseCtx);
    const body = getCallBody(fetchMock) as PayloadShape;
    const fieldNames = body.embeds[0].fields.map((f) => f.name);
    expect(fieldNames).toContain("Price");
    expect(fieldNames).toContain("SKU");
    expect(fieldNames).toContain("State");
  });

  it("omits Note field when ctx.note is not provided", async () => {
    await sendRestockAlert(WEBHOOK_URL, baseCtx);
    const body = getCallBody(fetchMock) as PayloadShape;
    const noteField = body.embeds[0].fields.find((f) => f.name === "Note");
    expect(noteField).toBeUndefined();
  });

  it("includes Note field when ctx.note is provided", async () => {
    await sendRestockAlert(WEBHOOK_URL, { ...baseCtx, note: "Watch this one carefully" });
    const body = getCallBody(fetchMock) as PayloadShape;
    const noteField = body.embeds[0].fields.find((f) => f.name === "Note");
    expect(noteField).toBeDefined();
    expect(noteField?.value).toBe("Watch this one carefully");
    expect(noteField?.inline).toBe(false);
  });

  it("uses username 'Inventory Monitor'", async () => {
    await sendRestockAlert(WEBHOOK_URL, baseCtx);
    const body = getCallBody(fetchMock) as PayloadShape;
    expect(body.username).toBe("Inventory Monitor");
  });

  it("uses green color (5763719) for restock alert", async () => {
    await sendRestockAlert(WEBHOOK_URL, baseCtx);
    const body = getCallBody(fetchMock) as PayloadShape;
    expect(body.embeds[0].color).toBe(5763719);
  });

  it("uses 'Tap title to open • Add-to-cart link below' footer", async () => {
    await sendRestockAlert(WEBHOOK_URL, baseCtx);
    const body = getCallBody(fetchMock) as PayloadShape;
    expect(body.embeds[0].footer.text).toBe("Tap title to open • Add-to-cart link below");
  });

  it("returns { ok: true, status } on 2xx", async () => {
    fetchMock.mockResolvedValueOnce(mockOkResponse(204));
    const result = await sendRestockAlert(WEBHOOK_URL, baseCtx);
    expect(result).toEqual({ ok: true, status: 204 });
  });

  it("returns { ok: false, status: 500, error: 'HTTP 500' } on HTTP 500", async () => {
    fetchMock.mockResolvedValueOnce(mockErrorResponse(500));
    const result = await sendRestockAlert(WEBHOOK_URL, baseCtx);
    expect(result).toEqual({ ok: false, status: 500, error: "HTTP 500" });
  });

  it("returns { ok: false, error } on network rejection without throwing", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network error"));
    const result = await sendRestockAlert(WEBHOOK_URL, baseCtx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("network error");
    }
  });

  it("returns { ok: false, error } on AbortError (timeout) without throwing", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    fetchMock.mockRejectedValueOnce(abortError);
    const result = await sendRestockAlert(WEBHOOK_URL, baseCtx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("The operation was aborted");
    }
  });

  it("formatted Price field shows '(was $Y.YY)' when regular > current", async () => {
    await sendRestockAlert(WEBHOOK_URL, baseCtx);
    const body = getCallBody(fetchMock) as PayloadShape;
    const priceField = body.embeds[0].fields.find((f) => f.name === "Price");
    expect(priceField?.value).toBe("$159.99 (was $199.99)");
  });

  it("formatted Price field omits '(was ...)' when no regular price", async () => {
    const ctx: AlertContext = { ...baseCtx, regularPriceCents: undefined };
    await sendRestockAlert(WEBHOOK_URL, ctx);
    const body = getCallBody(fetchMock) as PayloadShape;
    const priceField = body.embeds[0].fields.find((f) => f.name === "Price");
    expect(priceField?.value).toBe("$159.99");
    expect(priceField?.value).not.toContain("was");
  });
});

describe("sendReminder", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(mockOkResponse());
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses "🟢 STILL IN STOCK —" as the embed title prefix', async () => {
    await sendReminder(WEBHOOK_URL, baseCtx);
    const body = getCallBody(fetchMock) as PayloadShape;
    expect(body.embeds[0].title).toContain("🟢 STILL IN STOCK —");
    expect(body.embeds[0].title).toContain(baseCtx.name);
  });

  it("uses 'reminder • Tap title to open' footer", async () => {
    await sendReminder(WEBHOOK_URL, baseCtx);
    const body = getCallBody(fetchMock) as PayloadShape;
    expect(body.embeds[0].footer.text).toBe("reminder • Tap title to open");
  });

  it("preserves the same content (cart URL) as restock alert", async () => {
    await sendReminder(WEBHOOK_URL, baseCtx);
    const body = getCallBody(fetchMock) as PayloadShape;
    expect(body.content).toBe(baseCtx.cartUrl);
  });
});

describe("sendTestAlert", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(mockOkResponse());
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses "🧪 TEST —" as the embed title prefix', async () => {
    await sendTestAlert(WEBHOOK_URL);
    const body = getCallBody(fetchMock) as PayloadShape;
    expect(body.embeds[0].title).toContain("🧪 TEST —");
  });

  it("uses the hardcoded test name in the title", async () => {
    await sendTestAlert(WEBHOOK_URL);
    const body = getCallBody(fetchMock) as PayloadShape;
    expect(body.embeds[0].title).toContain("TEST — Inventory Monitor is connected");
  });

  it("uses amber-ish color (16766720) to be visually distinct", async () => {
    await sendTestAlert(WEBHOOK_URL);
    const body = getCallBody(fetchMock) as PayloadShape;
    expect(body.embeds[0].color).toBe(16766720);
  });

  it("uses the test footer", async () => {
    await sendTestAlert(WEBHOOK_URL);
    const body = getCallBody(fetchMock) as PayloadShape;
    expect(body.embeds[0].footer.text).toBe(
      "test notification • If you see this, your webhook works",
    );
  });

  it("includes the test note field", async () => {
    await sendTestAlert(WEBHOOK_URL);
    const body = getCallBody(fetchMock) as PayloadShape;
    const noteField = body.embeds[0].fields.find((f) => f.name === "Note");
    expect(noteField?.value).toBe(
      "If you see this in Discord, your webhook is wired up correctly.",
    );
  });

  it("returns { ok: true, status } on 2xx", async () => {
    fetchMock.mockResolvedValueOnce(mockOkResponse(204));
    const result = await sendTestAlert(WEBHOOK_URL);
    expect(result).toEqual({ ok: true, status: 204 });
  });
});

const priceCtx: PriceDropContext = {
  ...baseCtx,
  currentPriceCents: 12999,
  targetPriceCents: 13000,
};

describe("sendPriceDropAlert", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(mockOkResponse());
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses '💰 PRICE TARGET HIT —' title prefix with product name", async () => {
    await sendPriceDropAlert(WEBHOOK_URL, priceCtx);
    const body = getCallBody(fetchMock) as PayloadShape;
    expect(body.embeds[0].title).toBe(`💰 PRICE TARGET HIT — ${priceCtx.name}`);
  });

  it("uses blue color 0x3b82f6 (3,901,179 decimal)", async () => {
    await sendPriceDropAlert(WEBHOOK_URL, priceCtx);
    const body = getCallBody(fetchMock) as PayloadShape;
    expect(body.embeds[0].color).toBe(0x3b82f6);
  });

  it("renders price field as '$current (target $X.XX · $Y.YY below)' when below target", async () => {
    await sendPriceDropAlert(WEBHOOK_URL, priceCtx);
    const body = getCallBody(fetchMock) as PayloadShape;
    const priceField = body.embeds[0].fields.find((f) => f.name === "Price");
    expect(priceField?.value).toBe("$129.99 (target $130.00 · $0.01 below)");
  });

  it("renders price field as '$current (target $X.XX)' when exactly at target", async () => {
    await sendPriceDropAlert(WEBHOOK_URL, {
      ...priceCtx,
      currentPriceCents: 13000,
      targetPriceCents: 13000,
    });
    const body = getCallBody(fetchMock) as PayloadShape;
    const priceField = body.embeds[0].fields.find((f) => f.name === "Price");
    expect(priceField?.value).toBe("$130.00 (target $130.00)");
  });

  it("renders Target inline field with the configured value", async () => {
    await sendPriceDropAlert(WEBHOOK_URL, priceCtx);
    const body = getCallBody(fetchMock) as PayloadShape;
    const target = body.embeds[0].fields.find((f) => f.name === "Target");
    const sku = body.embeds[0].fields.find((f) => f.name === "SKU");
    expect(target?.value).toBe("$130.00");
    expect(target?.inline).toBe(true);
    expect(sku?.value).toBe(priceCtx.sku);
    expect(sku?.inline).toBe(true);
  });

  it("sets content to ctx.cartUrl for unfurl", async () => {
    await sendPriceDropAlert(WEBHOOK_URL, priceCtx);
    const body = getCallBody(fetchMock) as PayloadShape;
    expect(body.content).toBe(priceCtx.cartUrl);
  });

  it("returns { ok: true, status } on 2xx", async () => {
    fetchMock.mockResolvedValueOnce(mockOkResponse(204));
    const result = await sendPriceDropAlert(WEBHOOK_URL, priceCtx);
    expect(result).toEqual({ ok: true, status: 204 });
  });

  it("returns { ok: false, error } on network rejection", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network error"));
    const result = await sendPriceDropAlert(WEBHOOK_URL, priceCtx);
    expect(result.ok).toBe(false);
  });
});

describe("sendCombinedAlert", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(mockOkResponse());
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses '🟢💰 IN STOCK + PRICE TARGET HIT —' title prefix", async () => {
    await sendCombinedAlert(WEBHOOK_URL, priceCtx);
    const body = getCallBody(fetchMock) as PayloadShape;
    expect(body.embeds[0].title).toBe(`🟢💰 IN STOCK + PRICE TARGET HIT — ${priceCtx.name}`);
  });

  it("stays green (primary) for the embed color", async () => {
    await sendCombinedAlert(WEBHOOK_URL, priceCtx);
    const body = getCallBody(fetchMock) as PayloadShape;
    expect(body.embeds[0].color).toBe(5763719);
  });

  it("includes SKU and State inline fields", async () => {
    await sendCombinedAlert(WEBHOOK_URL, priceCtx);
    const body = getCallBody(fetchMock) as PayloadShape;
    const sku = body.embeds[0].fields.find((f) => f.name === "SKU");
    const state = body.embeds[0].fields.find((f) => f.name === "State");
    expect(sku?.inline).toBe(true);
    expect(state?.value).toBe(priceCtx.buttonState);
    expect(state?.inline).toBe(true);
  });

  it("fires exactly one webhook (no double-ping)", async () => {
    await sendCombinedAlert(WEBHOOK_URL, priceCtx);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sets content to ctx.cartUrl", async () => {
    await sendCombinedAlert(WEBHOOK_URL, priceCtx);
    const body = getCallBody(fetchMock) as PayloadShape;
    expect(body.content).toBe(priceCtx.cartUrl);
  });
});
