/**
 * GET /api/items/:id/deals/history?groupId=N — SPEC §22.7.
 *
 * Returns deal_price_history points for the item (optionally filtered to a
 * single group_id). Sorted by ts ASC so the client can plot directly.
 */
import { type NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db/client";
import { getDealHistoryForItem } from "@/lib/deals-query";

function parseId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0) return null;
  return n;
}

export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/items/[id]/deals/history">,
) {
  const { id: rawId } = await ctx.params;
  const id = parseId(rawId);
  if (id === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const groupIdRaw = req.nextUrl.searchParams.get("groupId");
  let groupId: number | undefined = undefined;
  if (groupIdRaw != null) {
    const n = Number.parseInt(groupIdRaw, 10);
    if (Number.isNaN(n) || n <= 0) {
      return NextResponse.json({ error: "Invalid groupId" }, { status: 400 });
    }
    groupId = n;
  }

  try {
    const db = getDb();
    const points = getDealHistoryForItem(db, id, groupId);
    return NextResponse.json({ itemId: id, groupId: groupId ?? null, points });
  } catch (err) {
    console.error("[GET /api/items/:id/deals/history]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
