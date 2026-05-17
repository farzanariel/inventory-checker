/**
 * POST /api/admin/deals/sync — force a deals.json sync now (SPEC §22.7).
 *
 * Cloudflare Access protects /api/admin/* at the edge; the app trusts the
 * tunnel headers and does no further authz.
 */
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db/client";
import { syncDeals } from "@/lib/deals-sync";

export async function POST() {
  try {
    const db = getDb();
    const outcome = await syncDeals(db);
    return NextResponse.json(outcome);
  } catch (err) {
    console.error("[POST /api/admin/deals/sync]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
