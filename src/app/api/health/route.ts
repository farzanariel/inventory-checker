/**
 * /api/health — worker liveness probe.
 *
 * SPEC §10. Reads the singleton worker_heartbeat row and returns:
 *   - 200 { status: 'ok', ... } if the worker has ticked within 60s
 *   - 503 { status: 'degraded', ... } if the row is missing or stale
 */

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db/client";
import { workerHeartbeat, type WorkerHeartbeat } from "@/lib/db/schema";

const STALE_THRESHOLD_MS = 60_000;

export async function GET() {
  try {
    const db = getDb();
    const row = db
      .select()
      .from(workerHeartbeat)
      .where(eq(workerHeartbeat.id, 1))
      .get() as WorkerHeartbeat | undefined;

    const now = Date.now();

    if (!row) {
      return NextResponse.json(
        {
          status: "degraded",
          worker_last_tick_age_ms: null,
          items_checked_last: null,
          last_tick_at: null,
        },
        { status: 503 },
      );
    }

    const ageMs = now - row.lastTickAt;
    const stale = ageMs > STALE_THRESHOLD_MS;

    const body = {
      status: stale ? "degraded" : "ok",
      worker_last_tick_age_ms: ageMs,
      items_checked_last: row.itemsCheckedLast,
      last_tick_at: row.lastTickAt,
    };

    return NextResponse.json(body, { status: stale ? 503 : 200 });
  } catch (err) {
    console.error("[GET /api/health]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
