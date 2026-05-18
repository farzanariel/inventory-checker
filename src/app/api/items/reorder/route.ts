/**
 * POST /api/items/reorder — bulk-update sort_order (SPEC §24).
 *
 * Body: { order: number[] }  — array of item IDs in their new visual order.
 * Position in array becomes sort_order. Items not listed are left untouched
 * (so a partial reorder is supported, though the UI sends the full list).
 */
import { eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/lib/db/client";
import { items } from "@/lib/db/schema";

const ReorderSchema = z.object({
  order: z.array(z.number().int().positive()).min(1).max(10_000),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = ReorderSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      { error: issue?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const ids = parsed.data.order;
  // Reject duplicates — surface a clear error rather than silently picking one.
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json(
      { error: "Duplicate ids in order array" },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    // Verify all ids exist before touching anything — avoids partial writes.
    const existing = db
      .select({ id: items.id })
      .from(items)
      .where(inArray(items.id, ids))
      .all();
    if (existing.length !== ids.length) {
      return NextResponse.json(
        { error: "One or more ids not found" },
        { status: 404 },
      );
    }
    const now = Date.now();
    db.transaction((tx) => {
      ids.forEach((id, idx) => {
        tx.update(items)
          .set({ sortOrder: idx, updatedAt: now })
          .where(eq(items.id, id))
          .run();
      });
    });
    return NextResponse.json({ ok: true, updated: ids.length });
  } catch (err) {
    console.error("[POST /api/items/reorder]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
