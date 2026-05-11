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
import { scrapePdpForSku } from "@/lib/bestbuy-headless";
import { applyCheckResult } from "@/lib/checker";

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
    const results = await fetchProducts([existing.sku]);
    let result = results.get(existing.sku);

    // Newer-catalog SKUs (e.g. 6663816) return ProductNotFoundException from
    // priceBlocks; fall back to the headless PDP scraper.
    if (result && !result.ok && isMissingFromPriceBlocks(result.error)) {
      result = await scrapePdpForSku(existing.sku);
    }

    if (!result) {
      return NextResponse.json(
        { error: "No result returned from upstream" },
        { status: 502 },
      );
    }

    const outcome = await applyCheckResult(existing.id, result, {
      webhookUrl: process.env.DISCORD_WEBHOOK_URL,
    });

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
