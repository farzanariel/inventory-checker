/**
 * /api/items/:id/events — recent stock events for an item.
 *
 * SPEC §10. Default limit 50, max 500. Ordered by ts DESC.
 */

import { desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db/client";
import { items, stockEvents, type Item } from "@/lib/db/schema";

function parseId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0) return null;
  return n;
}

function parseLimit(raw: string | null): number {
  if (raw === null) return 50;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0) return 50;
  if (n > 500) return 500;
  return n;
}

export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/items/[id]/events">,
) {
  const { id: rawId } = await ctx.params;
  const id = parseId(rawId);
  if (id === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const limit = parseLimit(req.nextUrl.searchParams.get("limit"));

  try {
    const db = getDb();
    const existing = db
      .select({ id: items.id })
      .from(items)
      .where(eq(items.id, id))
      .get() as Pick<Item, "id"> | undefined;

    if (!existing) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const rows = db
      .select()
      .from(stockEvents)
      .where(eq(stockEvents.itemId, id))
      .orderBy(desc(stockEvents.ts))
      .limit(limit)
      .all();

    return NextResponse.json(rows);
  } catch (err) {
    console.error("[GET /api/items/:id/events]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
