/**
 * /api/items — list (GET) and create (POST).
 *
 * SPEC §10. Validation via Zod. Smart-parses URL or raw SKU on POST and
 * schedules the item for immediate pickup by the worker.
 */

import { desc } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/lib/db/client";
import { items } from "@/lib/db/schema";
import {
  fetchProductMetaV2,
  fetchProducts,
  imageUrlForSku,
  interpretStock,
  isMissingFromPriceBlocks,
  productUrlForSku,
  type ProductResult,
} from "@/lib/bestbuy";
import { scrapePdpForSku } from "@/lib/bestbuy-headless";
import { resolveSkuFromInput } from "@/lib/parse-input";

const CreateItemSchema = z
  .object({
    input: z.string().min(1, "input is required"),
    check_interval_min: z.number().int().min(1).max(60).optional(),
    restock_notify_interval_min: z.number().int().min(1).max(1440).optional(),
    note: z.string().max(500).optional(),
    stock_alert_enabled: z.boolean().optional(),
    stock_notify_mode: z.enum(["once", "repeat"]).optional(),
    price_alert_enabled: z.boolean().optional(),
    target_price_cents: z.number().int().min(1).optional(),
    price_notify_interval_min: z.number().int().min(1).max(10080).optional(),
    price_notify_mode: z.enum(["once", "repeat"]).optional(),
    price_alert_while_oos: z.boolean().optional(),
  })
  .refine(
    (obj) =>
      obj.stock_alert_enabled !== false || obj.price_alert_enabled !== false,
    { message: "At least one of stock or price alerts must be enabled" },
  );

function firstZodIssue(err: z.ZodError): string {
  const issue = err.issues[0];
  if (!issue) return "Invalid request body";
  const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
  return `${path}${issue.message}`;
}

export async function GET() {
  try {
    const db = getDb();
    const rows = db.select().from(items).orderBy(desc(items.createdAt)).all();
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[GET /api/items]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
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

  const parsed = CreateItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: firstZodIssue(parsed.error) },
      { status: 400 },
    );
  }

  const skuParse = await resolveSkuFromInput(parsed.data.input);
  if (!skuParse.ok) {
    return NextResponse.json({ error: skuParse.error }, { status: 400 });
  }

  const now = Date.now();
  const checkIntervalMin = parsed.data.check_interval_min ?? 1;
  const restockNotifyIntervalMin =
    parsed.data.restock_notify_interval_min ?? 10;
  const productResults = await fetchProducts([skuParse.sku]);
  const productResult = productResults.get(skuParse.sku);
  let product: Extract<ProductResult, { ok: true }> | null = productResult?.ok
    ? productResult
    : null;

  // priceBlocks miss → run the headless PDP scraper once at save time so the
  // first row has real price/stock. If headless fails too, fall back to v2
  // metadata (name/brand only) and let the worker retry on its interval.
  let metaFallback: Awaited<ReturnType<typeof fetchProductMetaV2>> | null = null;
  if (!product && productResult && !productResult.ok && isMissingFromPriceBlocks(productResult.error)) {
    const headless = await scrapePdpForSku(skuParse.sku);
    if (headless.ok) {
      product = headless;
    } else {
      metaFallback = await fetchProductMetaV2(skuParse.sku);
    }
  }
  const meta = metaFallback?.ok ? metaFallback : null;

  try {
    const db = getDb();
    const inserted = db
      .insert(items)
      .values({
        sku: skuParse.sku,
        name: product?.name ?? meta?.name ?? null,
        brand: product?.brand ?? meta?.brand ?? null,
        productUrl: product?.canonicalUrl ?? meta?.canonicalUrl ?? productUrlForSku(skuParse.sku),
        imageUrl: imageUrlForSku(skuParse.sku),
        currentPriceCents: product?.currentPriceCents ?? null,
        regularPriceCents: product?.regularPriceCents ?? null,
        checkIntervalMin,
        restockNotifyIntervalMin,
        enabled: 1,
        note: parsed.data.note ?? null,
        ...(parsed.data.stock_alert_enabled !== undefined && {
          stockAlertEnabled: parsed.data.stock_alert_enabled ? 1 : 0,
        }),
        ...(parsed.data.stock_notify_mode !== undefined && {
          stockNotifyMode: parsed.data.stock_notify_mode,
        }),
        ...(parsed.data.price_alert_enabled !== undefined && {
          priceAlertEnabled: parsed.data.price_alert_enabled ? 1 : 0,
        }),
        ...(parsed.data.price_notify_mode !== undefined && {
          priceNotifyMode: parsed.data.price_notify_mode,
        }),
        ...(parsed.data.target_price_cents !== undefined && {
          targetPriceCents: parsed.data.target_price_cents,
        }),
        ...(parsed.data.price_notify_interval_min !== undefined && {
          priceNotifyIntervalMin: parsed.data.price_notify_interval_min,
        }),
        ...(parsed.data.price_alert_while_oos !== undefined && {
          priceAlertWhileOos: parsed.data.price_alert_while_oos ? 1 : 0,
        }),
        lastStockStatus: product ? interpretStock(product.buttonState) : "UNKNOWN",
        lastButtonState: product?.buttonState ?? null,
        healthStatus: "OK",
        consecutiveErrors: 0,
        nextCheckDueAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    return NextResponse.json(inserted, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes("UNIQUE constraint failed") ||
      message.includes("SQLITE_CONSTRAINT_UNIQUE")
    ) {
      return NextResponse.json(
        { error: "Item with this SKU already exists" },
        { status: 409 },
      );
    }
    console.error("[POST /api/items]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
