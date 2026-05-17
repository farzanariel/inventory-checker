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
import { fetchProductsViaPdp } from "@/lib/bestbuy-pdp";
import {
  fetchProductDetailsViaGraphql,
  type BestBuyProductDetails,
} from "@/lib/bestbuy-graphql";
import { fetchBestBuyLandingHtmlViaProxy } from "@/lib/bestbuy-landing";
import { resolveProductInput } from "@/lib/parse-input";
import { fetchMicroCenterProduct } from "@/lib/microcenter";
import { itemStores } from "@/lib/db/schema";
import { attachDealsToItems } from "@/lib/deals-query";

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
    // MicroCenter: subset of store numbers (e.g. ["029","131","055"]) to
    // alert on. Omitted ⇒ default to all stores. Ignored for BB items.
    enabled_store_numbers: z.array(z.string().regex(/^\d{3}$/)).optional(),
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
    const enriched = attachDealsToItems(db, rows);
    return NextResponse.json(enriched);
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

  const productInput = await resolveProductInput(parsed.data.input, {
    landingPageResolver: fetchBestBuyLandingHtmlViaProxy,
  });
  if (!productInput.ok) {
    return NextResponse.json({ error: productInput.error }, { status: 400 });
  }

  const now = Date.now();
  const checkIntervalMin = parsed.data.check_interval_min ?? 1;
  const restockNotifyIntervalMin =
    parsed.data.restock_notify_interval_min ?? 10;

  // ─── MicroCenter branch ───────────────────────────────────────────────────
  if (productInput.retailer === "microcenter") {
    const mcResult = await fetchMicroCenterProduct(productInput.mcProductId);
    if (!mcResult.ok) {
      return NextResponse.json({ error: `MicroCenter lookup failed: ${mcResult.error}` }, { status: 502 });
    }
    const enabledSet = parsed.data.enabled_store_numbers
      ? new Set(parsed.data.enabled_store_numbers)
      : null;
    try {
      const db = getDb();
      const inserted = db
        .insert(items)
        .values({
          retailer: "microcenter",
          sku: null,
          mcProductId: productInput.mcProductId,
          name: mcResult.name,
          brand: mcResult.brand ?? null,
          productUrl: mcResult.canonicalUrl,
          imageUrl: mcResult.imageUrl ?? null,
          currentPriceCents: mcResult.currentPriceCents,
          regularPriceCents: null,
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
          lastStockStatus: mcResult.stores.some(
            (s) =>
              s.qoh > 0 &&
              (enabledSet == null || enabledSet.has(s.storeNumber)),
          )
            ? "IN_STOCK"
            : "OUT_OF_STOCK",
          lastButtonState: null,
          healthStatus: "OK",
          consecutiveErrors: 0,
          nextCheckDueAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      // Hydrate item_stores from the freshly fetched inventory.
      for (const s of mcResult.stores) {
        const enabled = enabledSet ? (enabledSet.has(s.storeNumber) ? 1 : 0) : 1;
        const isOnline = s.storeNumber === "029" ? 1 : 0;
        db.insert(itemStores)
          .values({
            itemId: inserted.id,
            storeNumber: s.storeNumber,
            storeName: s.storeName,
            isOnline,
            alertEnabled: enabled,
            lastQoh: s.qoh,
            lastStockStatus: s.qoh > 0 ? "IN_STOCK" : "OUT_OF_STOCK",
            lastInStockAt: s.qoh > 0 ? now : null,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }

      return NextResponse.json(inserted, { status: 201 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes("UNIQUE constraint failed") ||
        message.includes("SQLITE_CONSTRAINT_UNIQUE")
      ) {
        return NextResponse.json(
          { error: "Item with this MicroCenter product already exists" },
          { status: 409 },
        );
      }
      console.error("[POST /api/items mc]", err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  }

  // ─── Best Buy branch (existing code, sku narrowed from parse) ─────────────
  const skuParse = { sku: productInput.sku };
  // SPEC §22 — fire GraphQL alongside priceBlocks to capture UPC. priceBlocks
  // doesn't expose UPC; we always want it for deal matching. Failure is OK —
  // the backfill script picks up anything we miss.
  const [productResults, upcDetailsMap] = await Promise.all([
    fetchProducts([skuParse.sku]),
    fetchProductDetailsViaGraphql([skuParse.sku]).catch(
      () => new Map<string, BestBuyProductDetails>(),
    ),
  ]);
  const productResult = productResults.get(skuParse.sku);
  let product: Extract<ProductResult, { ok: true }> | null = productResult?.ok
    ? productResult
    : null;
  const upcDetails = upcDetailsMap.get(skuParse.sku);
  let graphqlDetails: Extract<BestBuyProductDetails, { ok: true }> | null =
    upcDetails?.ok ? upcDetails : null;

  // priceBlocks miss → ask GraphQL-over-GET for live metadata, then fall back
  // to the older PDP scrape and v2 metadata.
  // Stock is still refreshed by the worker's fulfillment path.
  let metaFallback: Awaited<ReturnType<typeof fetchProductMetaV2>> | null = null;
  if (!product && productResult && !productResult.ok && isMissingFromPriceBlocks(productResult.error)) {
    // GraphQL was already attempted above (parallel UPC pre-fetch). If it
    // succeeded `graphqlDetails` is already set; otherwise fall through to
    // PDP scrape / v2 metadata.
    if (!graphqlDetails) {
      const pdpMap = await fetchProductsViaPdp([skuParse.sku]);
      const pdpResult = pdpMap.get(skuParse.sku);
      if (pdpResult?.ok) {
        product = pdpResult;
      } else {
        metaFallback = await fetchProductMetaV2(skuParse.sku);
      }
    }
  }
  const meta = metaFallback?.ok ? metaFallback : null;

  try {
    const db = getDb();
    const inserted = db
      .insert(items)
      .values({
        retailer: "bestbuy",
        sku: skuParse.sku,
        mcProductId: null,
        name: product?.name ?? graphqlDetails?.name ?? meta?.name ?? null,
        brand: product?.brand ?? graphqlDetails?.brand ?? meta?.brand ?? null,
        productUrl: product?.canonicalUrl ?? graphqlDetails?.canonicalUrl ?? meta?.canonicalUrl ?? productUrlForSku(skuParse.sku),
        imageUrl: product?.imageUrl ?? graphqlDetails?.imageUrl ?? imageUrlForSku(skuParse.sku),
        currentPriceCents: product?.currentPriceCents ?? graphqlDetails?.currentPriceCents ?? null,
        regularPriceCents: product?.regularPriceCents ?? graphqlDetails?.regularPriceCents ?? null,
        upc: graphqlDetails?.upc ?? null,
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
