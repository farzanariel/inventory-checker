/**
 * /api/items/:id/check-now — force an immediate check via the shared pipeline.
 *
 * SPEC §7.5: fetch happens outside any DB lock, then applyCheckResult runs
 * the BEGIN IMMEDIATE → decide → update → commit → webhook flow. Concurrency
 * with the worker is handled by re-reading the row inside the transaction.
 */

import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db/client";
import { items, type Item } from "@/lib/db/schema";
import { fetchProducts, isMissingFromPriceBlocks } from "@/lib/bestbuy";
import { fetchProductsViaPdp } from "@/lib/bestbuy-pdp";
import { applyCheckResult, applyMicroCenterCheckResult } from "@/lib/checker";
import { fetchMicroCenterProduct } from "@/lib/microcenter";

function parseId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0) return null;
  return n;
}

export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/items/[id]/check-now">,
) {
  const { id: rawId } = await ctx.params;
  const id = parseId(rawId);
  if (id === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const db = getDb();
    const existing = db
      .select()
      .from(items)
      .where(eq(items.id, id))
      .get() as Item | undefined;

    if (!existing) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Network fetch happens OUTSIDE any DB lock (SPEC §7.5).
    let outcome;
    if (existing.retailer === "microcenter") {
      if (!existing.mcProductId) {
        return NextResponse.json(
          { error: "MicroCenter item missing mc_product_id" },
          { status: 500 },
        );
      }
      const mcResult = await fetchMicroCenterProduct(existing.mcProductId);
      outcome = await applyMicroCenterCheckResult(existing.id, mcResult, {
        webhookUrl: process.env.DISCORD_WEBHOOK_URL,
      });
    } else {
      if (!existing.sku) {
        return NextResponse.json(
          { error: "Best Buy item missing sku" },
          { status: 500 },
        );
      }
      const sku: string = existing.sku;
      const results = await fetchProducts([sku]);
      let result = results.get(sku);
      // Newer-catalog SKUs (e.g. 6663816) return ProductNotFoundException from
      // priceBlocks; fall back to the curl+proxy PDP scraper (NEC-44).
      if (result && !result.ok && isMissingFromPriceBlocks(result.error)) {
        const pdpMap = await fetchProductsViaPdp([sku]);
        result = pdpMap.get(sku) ?? result;
      }
      if (!result) {
        return NextResponse.json(
          { error: "No result returned from upstream" },
          { status: 502 },
        );
      }
      outcome = await applyCheckResult(existing.id, result, {
        webhookUrl: process.env.DISCORD_WEBHOOK_URL,
      });
    }

    const updated = db
      .select()
      .from(items)
      .where(eq(items.id, id))
      .get() as Item | undefined;

    return NextResponse.json({ outcome, item: updated ?? null });
  } catch (err) {
    console.error("[POST /api/items/:id/check-now]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
