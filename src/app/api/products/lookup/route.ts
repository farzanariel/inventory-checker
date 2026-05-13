/**
 * /api/products/lookup — resolve a pasted Best Buy URL/SKU into product details.
 */

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  fetchProductMetaV2,
  fetchProducts,
  imageUrlForSku,
  isMissingFromPriceBlocks,
} from "@/lib/bestbuy";
import { resolveProductInput } from "@/lib/parse-input";
import { fetchMicroCenterProduct } from "@/lib/microcenter";

const LookupSchema = z.object({
  input: z.string().min(1, "input is required"),
});

function firstZodIssue(err: z.ZodError): string {
  const issue = err.issues[0];
  if (!issue) return "Invalid request body";
  const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
  return `${path}${issue.message}`;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = LookupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: firstZodIssue(parsed.error) },
      { status: 400 },
    );
  }

  const productInput = await resolveProductInput(parsed.data.input);
  if (!productInput.ok) {
    return NextResponse.json({ error: productInput.error }, { status: 400 });
  }

  // ─── MicroCenter branch ────────────────────────────────────────────────
  if (productInput.retailer === "microcenter") {
    const mc = await fetchMicroCenterProduct(productInput.mcProductId);
    if (!mc.ok) {
      return NextResponse.json({ error: mc.error }, { status: 502 });
    }
    const inStockCount = mc.stores.filter((s) => s.qoh > 0).length;
    return NextResponse.json({
      retailer: "microcenter" as const,
      mc_product_id: mc.mcProductId,
      name: mc.name,
      brand: mc.brand ?? null,
      image_url: mc.imageUrl ?? null,
      product_url: mc.canonicalUrl,
      current_price_cents: mc.currentPriceCents,
      regular_price_cents: null,
      button_state: null,
      purchasable: inStockCount > 0,
      stock_source: "microcenter-pdp" as const,
      stores: mc.stores.map((s) => ({
        store_number: s.storeNumber,
        store_name: s.storeName,
        qoh: s.qoh,
        is_online: s.storeNumber === "029",
        in_stock: s.qoh > 0,
      })),
    });
  }

  const skuParse = { sku: productInput.sku };
  const results = await fetchProducts([skuParse.sku]);
  const result = results.get(skuParse.sku);

  if (result?.ok) {
    return NextResponse.json({
      retailer: "bestbuy" as const,
      sku: result.sku,
      name: result.name,
      brand: result.brand ?? null,
      image_url: imageUrlForSku(result.sku),
      product_url: result.canonicalUrl,
      current_price_cents: result.currentPriceCents,
      regular_price_cents: result.regularPriceCents ?? null,
      button_state: result.buttonState,
      purchasable: result.purchasable,
      stock_source: "priceblocks" as const,
    });
  }

  // priceBlocks miss → return v2 catalog metadata so the lookup stays fast.
  // The full price+stock check (via headless) runs at save time in
  // POST /api/items, so the user sees details immediately and the heavy
  // scrape only fires once they commit to adding the item.
  if (result && !result.ok && isMissingFromPriceBlocks(result.error)) {
    const meta = await fetchProductMetaV2(skuParse.sku);
    if (meta.ok) {
      return NextResponse.json({
        retailer: "bestbuy" as const,
        sku: meta.sku,
        name: meta.name,
        brand: meta.brand ?? null,
        image_url: imageUrlForSku(meta.sku),
        product_url: meta.canonicalUrl,
        current_price_cents: null,
        regular_price_cents: null,
        button_state: null,
        purchasable: null,
        stock_source: "metadata-only" as const,
      });
    }
  }

  return NextResponse.json(
    { error: result?.error ?? "Product not found" },
    { status: 404 },
  );
}
