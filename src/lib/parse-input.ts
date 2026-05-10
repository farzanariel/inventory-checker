/**
 * Parse a Best Buy product URL or raw SKU into a SKU string.
 *
 * Accepted formats (in order of preference):
 *   1. New URL:  https://www.bestbuy.com/product/{slug}/sku/{6-8 digits}
 *   2. Old URL:  https://www.bestbuy.com/site/{slug}/{6-8 digits}.p?skuId={6-8 digits}
 *   3. Raw SKU:  6 to 8 digits
 *
 * Liberal in what it accepts (extra query strings, trailing slashes, http/https),
 * strict in what it returns (just the SKU digits).
 */
export function parseUrlOrSku(
  input: string
): { ok: true; sku: string } | { ok: false; error: string } {
  if (typeof input !== "string") {
    return { ok: false, error: "Input must be a string" };
  }

  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return { ok: false, error: "Input is empty" };
  }

  // 1. New URL format: /sku/{6-8 digits}
  const newUrlMatch = trimmed.match(/\/sku\/(\d{6,8})\b/);
  if (newUrlMatch) {
    return { ok: true, sku: newUrlMatch[1] };
  }

  // 2a. Old URL format: {6-8 digits}.p
  const oldUrlPMatch = trimmed.match(/(\d{6,8})\.p/);
  if (oldUrlPMatch) {
    return { ok: true, sku: oldUrlPMatch[1] };
  }

  // 2b. Old URL format query param: skuId={6-8 digits}
  const oldUrlSkuIdMatch = trimmed.match(/[?&]skuId=(\d{6,8})\b/);
  if (oldUrlSkuIdMatch) {
    return { ok: true, sku: oldUrlSkuIdMatch[1] };
  }

  // 3. Raw SKU: only digits, 6 to 8 of them
  const rawMatch = trimmed.match(/^(\d{6,8})$/);
  if (rawMatch) {
    return { ok: true, sku: rawMatch[1] };
  }

  return {
    ok: false,
    error:
      "Could not extract a Best Buy SKU. Paste a Best Buy product URL or a 6–8 digit SKU.",
  };
}
