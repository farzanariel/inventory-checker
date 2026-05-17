/**
 * /api/items/:id — PATCH (partial update) and DELETE.
 *
 * SPEC §10. PATCH validates fields with Zod. Toggling enabled false→true
 * resets next_check_due_at so the worker picks it up immediately.
 */

import { and, eq, inArray, notInArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/lib/db/client";
import { itemStores, items, type Item, type ItemStore } from "@/lib/db/schema";
import { attachDealsToItems } from "@/lib/deals-query";

const UpdateItemSchema = z
  .object({
    check_interval_min: z.number().int().min(1).max(60).optional(),
    restock_notify_interval_min: z.number().int().min(1).max(1440).optional(),
    enabled: z.boolean().optional(),
    note: z.string().max(500).nullable().optional(),
    stock_alert_enabled: z.boolean().optional(),
    stock_notify_mode: z.enum(["once", "repeat"]).optional(),
    price_alert_enabled: z.boolean().optional(),
    target_price_cents: z.number().int().min(1).nullable().optional(),
    price_notify_interval_min: z.number().int().min(1).max(10080).optional(),
    price_notify_mode: z.enum(["once", "repeat"]).optional(),
    price_alert_while_oos: z.boolean().optional(),
    // MicroCenter-only: which store_numbers should fire alerts.
    enabled_store_numbers: z.array(z.string().regex(/^\d{3}$/)).optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "At least one field is required",
  });

function firstZodIssue(err: z.ZodError): string {
  const issue = err.issues[0];
  if (!issue) return "Invalid request body";
  const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
  return `${path}${issue.message}`;
}

function parseId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0) return null;
  return n;
}

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/items/[id]">,
) {
  const { id: rawId } = await ctx.params;
  const id = parseId(rawId);
  if (id === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  try {
    const db = getDb();
    const item = db
      .select()
      .from(items)
      .where(eq(items.id, id))
      .get() as Item | undefined;
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    const [enriched] = attachDealsToItems(db, [item]);
    if (item.retailer === "microcenter") {
      const stores = db
        .select()
        .from(itemStores)
        .where(eq(itemStores.itemId, id))
        .all() as ItemStore[];
      return NextResponse.json({ ...enriched, stores });
    }
    return NextResponse.json(enriched);
  } catch (err) {
    console.error("[GET /api/items/:id]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<"/api/items/[id]">,
) {
  const { id: rawId } = await ctx.params;
  const id = parseId(rawId);
  if (id === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = UpdateItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: firstZodIssue(parsed.error) },
      { status: 400 },
    );
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

    const now = Date.now();
    const patch: Partial<Item> = { updatedAt: now };

    if (parsed.data.check_interval_min !== undefined) {
      patch.checkIntervalMin = parsed.data.check_interval_min;
    }
    if (parsed.data.restock_notify_interval_min !== undefined) {
      patch.restockNotifyIntervalMin = parsed.data.restock_notify_interval_min;
    }
    if (parsed.data.note !== undefined) {
      patch.note = parsed.data.note;
    }
    if (parsed.data.stock_alert_enabled !== undefined) {
      patch.stockAlertEnabled = parsed.data.stock_alert_enabled ? 1 : 0;
    }
    if (parsed.data.stock_notify_mode !== undefined) {
      patch.stockNotifyMode = parsed.data.stock_notify_mode;
    }
    if (parsed.data.price_alert_enabled !== undefined) {
      patch.priceAlertEnabled = parsed.data.price_alert_enabled ? 1 : 0;
    }
    if (
      parsed.data.price_notify_mode !== undefined &&
      parsed.data.price_notify_mode !== existing.priceNotifyMode
    ) {
      patch.priceNotifyMode = parsed.data.price_notify_mode;
      // Reset the once-mode "already fired" gate so the new mode starts fresh.
      patch.lastPriceNotifiedAt = null;
      patch.pendingHitPriceCents = null;
      patch.pendingHitSeenCount = 0;
    }
    if (parsed.data.target_price_cents !== undefined) {
      patch.targetPriceCents = parsed.data.target_price_cents;
      // Changing the target invalidates the pending-hit guard counters.
      patch.pendingHitPriceCents = null;
      patch.pendingHitSeenCount = 0;
    }
    if (parsed.data.price_notify_interval_min !== undefined) {
      patch.priceNotifyIntervalMin = parsed.data.price_notify_interval_min;
    }
    if (parsed.data.price_alert_while_oos !== undefined) {
      patch.priceAlertWhileOos = parsed.data.price_alert_while_oos ? 1 : 0;
    }
    const resultingStock =
      parsed.data.stock_alert_enabled ?? existing.stockAlertEnabled === 1;
    const resultingPrice =
      parsed.data.price_alert_enabled ?? existing.priceAlertEnabled === 1;
    if (!resultingStock && !resultingPrice) {
      return NextResponse.json(
        { error: "At least one of stock or price alerts must be enabled" },
        { status: 400 },
      );
    }
    if (parsed.data.enabled !== undefined) {
      const newEnabled = parsed.data.enabled ? 1 : 0;
      patch.enabled = newEnabled;
      // If we just re-enabled a disabled item, schedule it for immediate pickup.
      if (newEnabled === 1 && existing.enabled === 0) {
        patch.nextCheckDueAt = now;
      }
    }

    const updated = db
      .update(items)
      .set(patch)
      .where(eq(items.id, id))
      .returning()
      .get();

    // MicroCenter per-store alert toggles. Diff against current state.
    if (
      parsed.data.enabled_store_numbers !== undefined &&
      existing.retailer === "microcenter"
    ) {
      const targetSet = new Set(parsed.data.enabled_store_numbers);
      const enableList = [...targetSet];
      if (enableList.length > 0) {
        db.update(itemStores)
          .set({ alertEnabled: 1, updatedAt: now })
          .where(
            and(
              eq(itemStores.itemId, id),
              inArray(itemStores.storeNumber, enableList),
            ),
          )
          .run();
        db.update(itemStores)
          .set({ alertEnabled: 0, updatedAt: now })
          .where(
            and(
              eq(itemStores.itemId, id),
              notInArray(itemStores.storeNumber, enableList),
            ),
          )
          .run();
      } else {
        // Empty list ⇒ disable all stores for this item.
        db.update(itemStores)
          .set({ alertEnabled: 0, updatedAt: now })
          .where(eq(itemStores.itemId, id))
          .run();
      }
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[PATCH /api/items/:id]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/items/[id]">,
) {
  const { id: rawId } = await ctx.params;
  const id = parseId(rawId);
  if (id === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const db = getDb();
    const deleted = db
      .delete(items)
      .where(eq(items.id, id))
      .returning({ id: items.id })
      .get();

    if (!deleted) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/items/:id]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
