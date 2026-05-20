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
  productUrlForSku,
} from "@/lib/bestbuy";
import { fetchProductDetailsViaGraphql } from "@/lib/bestbuy-graphql";
import { fetchStockViaFulfillment, type FulfillmentItemContext } from "@/lib/bestbuy-tls";
import { fetchBestBuyLandingHtmlViaProxy } from "@/lib/bestbuy-landing";
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

  const productInput = await resolveProductInput(parsed.data.input, {
    landingPageResolver: fetchBestBuyLandingHtmlViaProxy,
  });
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
      upc: mc.upc ?? null,
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

  // priceBlocks miss → return live GraphQL-over-GET metadata when available,
  // falling back to v2 catalog metadata so lookup still succeeds.
  if (result && !result.ok && isMissingFromPriceBlocks(result.error)) {
    const detailsMap = await fetchProductDetailsViaGraphql([skuParse.sku]);
    const details = detailsMap.get(skuParse.sku);
    if (details?.ok) {
      const itemBySku = new Map<string, FulfillmentItemContext>([
        [
          skuParse.sku,
          {
            name: details.name,
            brand: details.brand ?? null,
            currentPriceCents: details.currentPriceCents,
            regularPriceCents: details.regularPriceCents ?? null,
            productUrl: details.canonicalUrl,
          },
        ],
      ]);
      const stock = (await fetchStockViaFulfillment([skuParse.sku], itemBySku)).get(
        skuParse.sku,
      );
      return NextResponse.json({
        retailer: "bestbuy" as const,
        sku: details.sku,
        name: details.name,
        brand: details.brand ?? null,
        image_url: details.imageUrl ?? imageUrlForSku(details.sku),
        product_url: details.canonicalUrl,
        current_price_cents: details.currentPriceCents,
        regular_price_cents: details.regularPriceCents ?? null,
        button_state: stock?.ok ? stock.buttonState : null,
        purchasable: stock?.ok ? stock.purchasable : null,
        stock_source: stock?.ok ? ("fulfillment+graphql" as const) : ("graphql-metadata" as const),
      });
    }

    const meta = await fetchProductMetaV2(skuParse.sku);
    if (meta.ok) {
      const itemBySku = new Map<string, FulfillmentItemContext>([
        [
          skuParse.sku,
          {
            name: meta.name,
            brand: meta.brand ?? null,
            currentPriceCents: null,
            regularPriceCents: null,
            productUrl: meta.canonicalUrl ?? productUrlForSku(skuParse.sku),
          },
        ],
      ]);
      const stock = (await fetchStockViaFulfillment([skuParse.sku], itemBySku)).get(
        skuParse.sku,
      );
      return NextResponse.json({
        retailer: "bestbuy" as const,
        sku: meta.sku,
        name: meta.name,
        brand: meta.brand ?? null,
        image_url: imageUrlForSku(meta.sku),
        product_url: meta.canonicalUrl,
        current_price_cents: null,
        regular_price_cents: null,
        button_state: stock?.ok ? stock.buttonState : null,
        purchasable: stock?.ok ? stock.purchasable : null,
        stock_source: stock?.ok ? ("fulfillment+metadata" as const) : ("metadata-only" as const),
      });
    }
  }

  return NextResponse.json(
    { error: result?.error ?? "Product not found" },
    { status: 404 },
  );
}
