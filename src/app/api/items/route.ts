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
  fetchProducts,
  imageUrlForSku,
  interpretStock,
  productUrlForSku,
} from "@/lib/bestbuy";
import { parseUrlOrSku } from "@/lib/parse-input";

const CreateItemSchema = z.object({
  input: z.string().min(1, "input is required"),
  check_interval_min: z.number().int().min(1).max(60).optional(),
  restock_notify_interval_min: z.number().int().min(1).max(1440).optional(),
  note: z.string().max(500).optional(),
});

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

  const skuParse = parseUrlOrSku(parsed.data.input);
  if (!skuParse.ok) {
    return NextResponse.json({ error: skuParse.error }, { status: 400 });
  }

  const now = Date.now();
  const checkIntervalMin = parsed.data.check_interval_min ?? 1;
  const restockNotifyIntervalMin =
    parsed.data.restock_notify_interval_min ?? 10;
  const productResults = await fetchProducts([skuParse.sku]);
  const productResult = productResults.get(skuParse.sku);
  const product = productResult?.ok ? productResult : null;

  try {
    const db = getDb();
    const inserted = db
      .insert(items)
      .values({
        sku: skuParse.sku,
        name: product?.name ?? null,
        brand: product?.brand ?? null,
        productUrl: product?.canonicalUrl ?? productUrlForSku(skuParse.sku),
        imageUrl: imageUrlForSku(skuParse.sku),
        currentPriceCents: product?.currentPriceCents ?? null,
        regularPriceCents: product?.regularPriceCents ?? null,
        checkIntervalMin,
        restockNotifyIntervalMin,
        enabled: 1,
        note: parsed.data.note ?? null,
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
