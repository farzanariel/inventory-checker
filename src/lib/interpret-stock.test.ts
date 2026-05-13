import { describe, test, expect } from "vitest";
import { interpretStock } from "./bestbuy";

describe("interpretStock", () => {
  test("ADD_TO_CART → IN_STOCK", () => {
    expect(interpretStock("ADD_TO_CART")).toBe("IN_STOCK");
  });

  test("LOW_STOCK → IN_STOCK", () => {
    expect(interpretStock("LOW_STOCK")).toBe("IN_STOCK");
  });

  test("IN_CART → IN_STOCK", () => {
    expect(interpretStock("IN_CART")).toBe("IN_STOCK");
  });

  test("CHECK_STORES → OUT_OF_STOCK", () => {
    expect(interpretStock("CHECK_STORES")).toBe("OUT_OF_STOCK");
  });

  test("SOLD_OUT_ONLINE → OUT_OF_STOCK", () => {
    expect(interpretStock("SOLD_OUT_ONLINE")).toBe("OUT_OF_STOCK");
  });

  test("SOLD_OUT → OUT_OF_STOCK", () => {
    expect(interpretStock("SOLD_OUT")).toBe("OUT_OF_STOCK");
  });

  test("COMING_SOON → OUT_OF_STOCK", () => {
    expect(interpretStock("COMING_SOON")).toBe("OUT_OF_STOCK");
  });

  test("PRE_ORDER → OUT_OF_STOCK", () => {
    expect(interpretStock("PRE_ORDER")).toBe("OUT_OF_STOCK");
  });

  test("undefined → UNKNOWN", () => {
    expect(interpretStock(undefined)).toBe("UNKNOWN");
  });

  test("null → UNKNOWN", () => {
    expect(interpretStock(null)).toBe("UNKNOWN");
  });

  test("empty string → UNKNOWN", () => {
    expect(interpretStock("")).toBe("UNKNOWN");
  });

  test("unrecognized string → UNKNOWN", () => {
    expect(interpretStock("SOME_FUTURE_STATE")).toBe("UNKNOWN");
  });
});
