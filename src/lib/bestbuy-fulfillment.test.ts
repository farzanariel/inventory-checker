/**
 * Unit tests for fetchStockViaFulfillment (SPEC §6.8 / Layer 1.5).
 *
 * Mocks execFile so no live network calls. Mirrors the pattern in
 * bestbuy-tls.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExecFile = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: mockExecFile,
}));

vi.mock("node:fs", () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

type ExecCb = (err: Error | null, stdout: string, stderr: string) => void;

function mockExecResolve(stdout: string, stderr = ""): void {
  mockExecFile.mockImplementationOnce(
    (_f: string, _a: string[], _o: unknown, cb: ExecCb) => cb(null, stdout, stderr),
  );
}

function fulfillmentBody(sku: string, buttonState: string): string {
  return JSON.stringify({
    data: {
      fulfillmentOptions: {
        buttonStates: [
          { __typename: "ButtonState", buttonState, skuId: sku, displayText: "Add to Cart" },
        ],
      },
    },
  });
}

import {
  fetchStockViaFulfillment,
  _resetWarmStateForTest,
  type FulfillmentItemContext,
} from "./bestbuy-tls.js";

function ctx(overrides: Partial<FulfillmentItemContext> = {}): FulfillmentItemContext {
  return {
    name: "Lenovo IdeaPad",
    brand: "Lenovo",
    currentPriceCents: 59999,
    regularPriceCents: 69999,
    productUrl: "https://www.bestbuy.com/site/-/6674708.p?skuId=6674708",
    ...overrides,
  };
}

describe("fetchStockViaFulfillment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetWarmStateForTest();
  });

  it("returns ok with stitched fields and new buttonState on ADD_TO_CART", async () => {
    mockExecResolve(""); // warmSession
    mockExecResolve(`${fulfillmentBody("6674708", "ADD_TO_CART")}\n200`);

    const items = new Map<string, FulfillmentItemContext>([["6674708", ctx()]]);
    const results = await fetchStockViaFulfillment(["6674708"], items);
    const r = results.get("6674708");

    expect(r?.ok).toBe(true);
    if (r?.ok) {
      expect(r.buttonState).toBe("ADD_TO_CART");
      expect(r.purchasable).toBe(true);
      expect(r.name).toBe("Lenovo IdeaPad");
      expect(r.brand).toBe("Lenovo");
      expect(r.currentPriceCents).toBe(59999);
      expect(r.regularPriceCents).toBe(69999);
      expect(r.canonicalUrl).toBe(
        "https://www.bestbuy.com/site/-/6674708.p?skuId=6674708",
      );
    }
  });

  it("maps SOLD_OUT to purchasable=false but still ok=true", async () => {
    mockExecResolve("");
    mockExecResolve(`${fulfillmentBody("6674708", "SOLD_OUT")}\n200`);

    const items = new Map([["6674708", ctx()]]);
    const results = await fetchStockViaFulfillment(["6674708"], items);
    const r = results.get("6674708");

    expect(r?.ok).toBe(true);
    if (r?.ok) {
      expect(r.buttonState).toBe("SOLD_OUT");
      expect(r.purchasable).toBe(false);
    }
  });

  it("returns ok=false when buttonStates is empty", async () => {
    mockExecResolve("");
    const emptyBody = JSON.stringify({
      data: { fulfillmentOptions: { buttonStates: [] } },
    });
    mockExecResolve(`${emptyBody}\n200`);

    const items = new Map([["6674708", ctx()]]);
    const results = await fetchStockViaFulfillment(["6674708"], items);
    const r = results.get("6674708");

    expect(r?.ok).toBe(false);
    if (!r?.ok) {
      expect(r?.error).toContain("fulfillment");
      expect(r?.error).toContain("missing buttonState");
    }
  });

  it("returns ok=false on HTTP 503", async () => {
    mockExecResolve("");
    mockExecResolve("Service Unavailable\n503");

    const items = new Map([["6674708", ctx()]]);
    const results = await fetchStockViaFulfillment(["6674708"], items);
    const r = results.get("6674708");

    expect(r?.ok).toBe(false);
    if (!r?.ok) {
      expect(r?.error).toContain("HTTP 503");
    }
  });

  it("returns ok=false on invalid JSON", async () => {
    mockExecResolve("");
    mockExecResolve("<!doctype html><html>blocked</html>\n200");

    const items = new Map([["6674708", ctx()]]);
    const results = await fetchStockViaFulfillment(["6674708"], items);
    const r = results.get("6674708");

    expect(r?.ok).toBe(false);
    if (!r?.ok) {
      expect(r?.error).toContain("invalid JSON");
    }
  });

  it("issues one curl call per SKU (no batching)", async () => {
    mockExecResolve(""); // warmSession
    mockExecResolve(`${fulfillmentBody("6674708", "ADD_TO_CART")}\n200`);
    mockExecResolve(`${fulfillmentBody("6589861", "SOLD_OUT")}\n200`);

    const items = new Map([
      ["6674708", ctx({ name: "A" })],
      ["6589861", ctx({ name: "B", productUrl: "https://www.bestbuy.com/site/-/6589861.p?skuId=6589861" })],
    ]);
    const results = await fetchStockViaFulfillment(["6674708", "6589861"], items);

    // 1 warm + 2 fulfillment calls = 3 execFile calls
    expect(mockExecFile).toHaveBeenCalledTimes(3);
    expect(results.get("6674708")?.ok).toBe(true);
    expect(results.get("6589861")?.ok).toBe(true);
  });

  it("URL-encodes the variables JSON with the SKU and ZIP", async () => {
    mockExecResolve("");
    mockExecResolve(`${fulfillmentBody("6674708", "ADD_TO_CART")}\n200`);

    const items = new Map([["6674708", ctx()]]);
    await fetchStockViaFulfillment(["6674708"], items);

    const callArgs = mockExecFile.mock.calls[1][1] as string[];
    const url = callArgs[callArgs.length - 1];
    expect(url).toContain("/gateway/graphql/fulfillment?variables=");
    // Decode and assert structure
    const encoded = url.split("variables=")[1];
    const decoded = JSON.parse(decodeURIComponent(encoded));
    expect(decoded).toEqual({
      fulfillmentOptionsInput: { sku: "6674708", shipping: { destinationZipCode: "10001" } },
    });
  });

  it("respects BESTBUY_FULFILLMENT_ZIP env override", async () => {
    const prev = process.env.BESTBUY_FULFILLMENT_ZIP;
    process.env.BESTBUY_FULFILLMENT_ZIP = "94103";
    try {
      mockExecResolve("");
      mockExecResolve(`${fulfillmentBody("6674708", "ADD_TO_CART")}\n200`);
      const items = new Map([["6674708", ctx()]]);
      await fetchStockViaFulfillment(["6674708"], items);

      const callArgs = mockExecFile.mock.calls[1][1] as string[];
      const url = callArgs[callArgs.length - 1];
      const decoded = JSON.parse(decodeURIComponent(url.split("variables=")[1]));
      expect(decoded.fulfillmentOptionsInput.shipping.destinationZipCode).toBe("94103");
    } finally {
      if (prev === undefined) delete process.env.BESTBUY_FULFILLMENT_ZIP;
      else process.env.BESTBUY_FULFILLMENT_ZIP = prev;
    }
  });

  it("returns ok=false when item context is missing", async () => {
    mockExecResolve("");
    mockExecResolve(`${fulfillmentBody("6674708", "ADD_TO_CART")}\n200`);

    const items = new Map<string, FulfillmentItemContext>(); // empty
    const results = await fetchStockViaFulfillment(["6674708"], items);
    const r = results.get("6674708");

    expect(r?.ok).toBe(false);
    if (!r?.ok) {
      expect(r?.error).toContain("item context");
    }
  });

  it("returns empty map when given no SKUs (no execFile calls)", async () => {
    const results = await fetchStockViaFulfillment([], new Map());
    expect(results.size).toBe(0);
    expect(mockExecFile).not.toHaveBeenCalled();
  });
});
