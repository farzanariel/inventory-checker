/**
 * /api/products/lookup — resolve a pasted Best Buy URL/SKU into product details.
 */

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { fetchProducts, imageUrlForSku } from "@/lib/bestbuy";
import { parseUrlOrSku } from "@/lib/parse-input";

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

  const skuParse = parseUrlOrSku(parsed.data.input);
  if (!skuParse.ok) {
    return NextResponse.json({ error: skuParse.error }, { status: 400 });
  }

  const results = await fetchProducts([skuParse.sku]);
  const result = results.get(skuParse.sku);

  if (!result?.ok) {
    return NextResponse.json(
      { error: result?.error ?? "Product not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    sku: result.sku,
    name: result.name,
    brand: result.brand ?? null,
    image_url: imageUrlForSku(result.sku),
    product_url: result.canonicalUrl,
    current_price_cents: result.currentPriceCents,
    regular_price_cents: result.regularPriceCents ?? null,
    button_state: result.buttonState,
    purchasable: result.purchasable,
  });
}
