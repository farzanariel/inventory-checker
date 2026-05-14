/**
 * Shared transactional check pipeline (SPEC §7, §7.5, §9.1).
 *
 * The Best Buy fetch happens BEFORE this is called — never inside the
 * transaction. This file is the single source of truth for what one
 * `ProductResult` does to one `items` row.
 */

import { and, eq } from "drizzle-orm";
import { itemStores, items, stockEvents, type Item, type ItemStore } from "./db/schema";
import { getDb } from "./db/client";
import {
  imageUrlForSku,
  interpretStock,
  isMissingFromPriceBlocks,
  productUrlForSku,
  cartUrlForSku,
  type ProductResult,
  type StockStatus,
} from "./bestbuy";
import {
  microcenterPdpUrl,
  type McProductResult,
} from "./microcenter";
import {
  type PriceDropContext,
  sendCombinedAlert,
  sendPriceDropAlert,
  sendReminder,
  sendRestockAlert,
  type AlertContext,
} from "./discord";
import { getSettings } from "./settings";

export type NotificationKind =
  | "alert"
  | "reminder"
  | "price_drop"
  | "combined"
  | null;

export type CheckOutcome = {
  transitioned: boolean;
  notification: NotificationKind;
  webhookOk: boolean | null;
  reason: string;
};

export type ApplyOptions = {
  db?: ReturnType<typeof getDb>;
  now?: number;
  webhookUrl?: string;
  webhookUsername?: string;
  suppressWebhook?: boolean;
};

export function computeNextCheckDueAt(
  now: number,
  checkIntervalMin: number,
): number {
  const jitter = 0.9 + Math.random() * 0.2;
  return now + Math.round(checkIntervalMin * 60_000 * jitter);
}

type TxnEvent =
  | { kind: "transition"; status: StockStatus; buttonState?: string; priceCents?: number }
  | { kind: "error"; message: string }
  | { kind: "info"; status: string; message: string }
  | null;

type DecisionOutput = {
  patch: Partial<Item>;
  newStockStatus: StockStatus;
  transitioned: boolean;
  stockNotification: "alert" | "reminder" | null;
  priceNotification: "price_drop" | null;
  notification: NotificationKind;
  insideTxnEvent: TxnEvent;
  priceEvent:
    | {
        kind: "price_drop";
        mode: "target" | "drop";
        buttonState?: string;
        oldPriceCents: number;
        newPriceCents: number;
      }
    | null;
  reason: string;
};

type PriceAlertDecision = {
  patch: Partial<Item>;
  notification: "price_drop" | null;
  reason: string;
  event:
    | {
        kind: "price_drop";
        mode: "target" | "drop";
        oldPriceCents: number;
        newPriceCents: number;
      }
    | null;
};

function combineNotifications(
  stockNotification: "alert" | "reminder" | null,
  priceNotification: "price_drop" | null,
): NotificationKind {
  if (stockNotification && priceNotification) return "combined";
  return stockNotification ?? priceNotification;
}

/**
 * Price-alert decision (SPEC §19 v6 — dual mode).
 *
 * Mode is selected per item by whether `targetPriceCents` is set:
 *   • target mode  — fire when current <= target.
 *   • drop mode    — fire on any decrease vs the previously observed price
 *                    (item.currentPriceCents). Baseline tracks the last
 *                    observed price up *and* down, so a price increase
 *                    re-anchors the comparison.
 *
 * Both modes share: two-consecutive same-value confirmation guard, per-item
 * cooldown, and the while-OOS suppression toggle.
 *
 * Event payload:
 *   • target mode → oldPriceCents = target, newPriceCents = hit price.
 *   • drop mode   → oldPriceCents = previous price, newPriceCents = hit price.
 */
export function decidePriceAlert(
  item: Item,
  currentPriceCents: number,
  newStockStatus: StockStatus,
  now: number,
): PriceAlertDecision {
  if (item.priceAlertEnabled !== 1) {
    return {
      patch: { pendingHitPriceCents: null, pendingHitSeenCount: 0 },
      notification: null,
      reason: "price alerts disabled",
      event: null,
    };
  }

  const mode: "target" | "drop" = item.targetPriceCents != null ? "target" : "drop";

  // Comparison anchor:
  //   • target mode → always the configured target.
  //   • drop mode   → the pre-drop price captured when the dip was first
  //     detected; stored in `pendingHitPriceCents` while we wait for
  //     confirmation. Before the first dip is detected we use the prior
  //     observed `item.currentPriceCents`.
  // `pendingHitPriceCents` therefore means two different things by mode:
  //   • target mode → the candidate price (must match exactly across two ticks).
  //   • drop mode   → the pre-drop anchor (any sub-anchor candidate counts).
  let anchor: number;
  let isHit: boolean;
  if (mode === "target") {
    anchor = item.targetPriceCents as number;
    isHit = currentPriceCents <= anchor;
  } else if (item.pendingHitPriceCents != null) {
    anchor = item.pendingHitPriceCents;
    isHit = currentPriceCents <= anchor;
  } else {
    if (item.currentPriceCents == null) {
      return {
        patch: { pendingHitPriceCents: null, pendingHitSeenCount: 0 },
        notification: null,
        reason: "drop mode: no prior price observed",
        event: null,
      };
    }
    anchor = item.currentPriceCents;
    isHit = currentPriceCents < anchor;
  }

  if (!isHit) {
    return {
      patch: { pendingHitPriceCents: null, pendingHitSeenCount: 0 },
      notification: null,
      reason: mode === "target" ? "current above target" : "no decrease vs anchor",
      event: null,
    };
  }

  // Track a hit toward confirmation. Mode determines how `pendingHitPriceCents` is interpreted.
  const trackHit = (): Partial<Item> => {
    if (mode === "drop") {
      // Anchor is stable across the confirmation window. Once stored, leave it alone and just bump count.
      const samePending = item.pendingHitPriceCents === anchor;
      return {
        pendingHitPriceCents: anchor,
        pendingHitSeenCount: samePending ? item.pendingHitSeenCount + 1 : 1,
      };
    }
    if (item.pendingHitPriceCents !== currentPriceCents) {
      return { pendingHitPriceCents: currentPriceCents, pendingHitSeenCount: 1 };
    }
    return {
      pendingHitPriceCents: currentPriceCents,
      pendingHitSeenCount: item.pendingHitSeenCount + 1,
    };
  };

  const cooldownMs = item.priceNotifyIntervalMin * 60_000;
  // In 'once' mode, a prior fire silences further price notifications
  // permanently — until the user reconfigures the alert (PATCH clears
  // lastPriceNotifiedAt? no — they'd toggle mode back to repeat, or change
  // target which already resets pending-hit guards; that's a deliberate
  // trade-off for the simpler mental model).
  const onceModeAlreadyFired =
    item.priceNotifyMode === "once" && item.lastPriceNotifiedAt != null;
  const inCooldown =
    onceModeAlreadyFired ||
    (item.lastPriceNotifiedAt != null && now - item.lastPriceNotifiedAt < cooldownMs);
  const suppressWhileOos =
    item.priceAlertWhileOos !== 1 && newStockStatus === "OUT_OF_STOCK";

  if (inCooldown || suppressWhileOos) {
    return {
      patch: trackHit(),
      notification: null,
      reason: inCooldown ? "price cooldown active" : "price alerts suppressed while OOS",
      event: null,
    };
  }

  // First-observation gate.
  const isFirstObservation =
    mode === "drop"
      ? item.pendingHitPriceCents !== anchor
      : item.pendingHitPriceCents !== currentPriceCents;

  if (isFirstObservation) {
    return {
      patch:
        mode === "drop"
          ? { pendingHitPriceCents: anchor, pendingHitSeenCount: 1 }
          : { pendingHitPriceCents: currentPriceCents, pendingHitSeenCount: 1 },
      notification: null,
      reason: "price-hit first observation",
      event: null,
    };
  }

  if (item.pendingHitSeenCount + 1 < 2) {
    return {
      patch:
        mode === "drop"
          ? { pendingHitPriceCents: anchor, pendingHitSeenCount: item.pendingHitSeenCount + 1 }
          : { pendingHitPriceCents: currentPriceCents, pendingHitSeenCount: item.pendingHitSeenCount + 1 },
      notification: null,
      reason: "awaiting second consecutive hit",
      event: null,
    };
  }

  return {
    patch: {
      lastPriceNotifiedAt: now,
      pendingHitPriceCents: null,
      pendingHitSeenCount: 0,
    },
    notification: "price_drop",
    reason: mode === "target" ? "target price hit (confirmed)" : "price decrease confirmed",
    event: {
      kind: "price_drop",
      mode,
      oldPriceCents: anchor,
      newPriceCents: currentPriceCents,
    },
  };
}

function decideStock(
  item: Item,
  result: Extract<ProductResult, { ok: true }>,
  newStockStatus: StockStatus,
  now: number,
  nextCheckDueAt: number,
): Omit<DecisionOutput, "priceNotification" | "notification" | "priceEvent"> {
  const prev: StockStatus = item.lastStockStatus as StockStatus;

  const patch: Partial<Item> = {
    name: result.name,
    brand: result.brand ?? null,
    imageUrl: result.imageUrl ?? imageUrlForSku(item.sku ?? ""),
    productUrl: result.canonicalUrl ?? productUrlForSku(item.sku ?? ""),
    currentPriceCents: result.currentPriceCents,
    regularPriceCents: result.regularPriceCents ?? null,
    lastButtonState: result.buttonState,
    lastCheckedAt: now,
    consecutiveErrors: 0,
    healthStatus: "OK",
    lastHealthMessage: null,
    nextCheckDueAt,
    updatedAt: now,
  };

  const stockAlertsOn = item.stockAlertEnabled === 1;

  if (prev === "UNKNOWN" && newStockStatus === "IN_STOCK") {
    patch.lastStockStatus = "IN_STOCK";
    patch.lastInStockAt = now;
    if (stockAlertsOn) patch.lastNotifiedAt = now;
    return {
      patch,
      newStockStatus,
      transitioned: true,
      stockNotification: stockAlertsOn ? "alert" : null,
      insideTxnEvent: {
        kind: "transition",
        status: "IN_STOCK",
        buttonState: result.buttonState,
        priceCents: result.currentPriceCents,
      },
      reason: stockAlertsOn
        ? "UNKNOWN -> IN_STOCK (first-seen alert)"
        : "UNKNOWN -> IN_STOCK (stock alerts off)",
    };
  }

  if (prev === "UNKNOWN" && newStockStatus === "OUT_OF_STOCK") {
    patch.lastStockStatus = "OUT_OF_STOCK";
    return {
      patch,
      newStockStatus,
      transitioned: true,
      stockNotification: null,
      insideTxnEvent: {
        kind: "transition",
        status: "OUT_OF_STOCK",
        buttonState: result.buttonState,
        priceCents: result.currentPriceCents,
      },
      reason: "UNKNOWN -> OUT_OF_STOCK (no first-seen alert on OOS)",
    };
  }

  if (prev === "OUT_OF_STOCK" && newStockStatus === "IN_STOCK") {
    patch.lastStockStatus = "IN_STOCK";
    patch.lastInStockAt = now;
    if (stockAlertsOn) patch.lastNotifiedAt = now;
    return {
      patch,
      newStockStatus,
      transitioned: true,
      stockNotification: stockAlertsOn ? "alert" : null,
      insideTxnEvent: {
        kind: "transition",
        status: "IN_STOCK",
        buttonState: result.buttonState,
        priceCents: result.currentPriceCents,
      },
      reason: stockAlertsOn
        ? "OUT_OF_STOCK -> IN_STOCK (restock alert)"
        : "OUT_OF_STOCK -> IN_STOCK (stock alerts off)",
    };
  }

  if (prev === "IN_STOCK" && newStockStatus === "IN_STOCK") {
    const intervalMs = item.restockNotifyIntervalMin * 60_000;
    const last = item.lastNotifiedAt;
    const remindersOn = stockAlertsOn && item.stockNotifyMode === "repeat";
    const dueForReminder =
      remindersOn && (last == null || now - last >= intervalMs);

    if (dueForReminder) {
      patch.lastNotifiedAt = now;
      patch.lastInStockAt = now;
      return {
        patch,
        newStockStatus,
        transitioned: false,
        stockNotification: "reminder",
        insideTxnEvent: null,
        reason: "IN_STOCK steady (reminder window elapsed)",
      };
    }

    patch.lastInStockAt = now;
    return {
      patch,
      newStockStatus,
      transitioned: false,
      stockNotification: null,
      insideTxnEvent: null,
      reason: "IN_STOCK steady (within reminder window)",
    };
  }

  if (prev === "IN_STOCK" && newStockStatus === "OUT_OF_STOCK") {
    patch.lastStockStatus = "OUT_OF_STOCK";
    patch.lastNotifiedAt = null;
    return {
      patch,
      newStockStatus,
      transitioned: true,
      stockNotification: null,
      insideTxnEvent: {
        kind: "transition",
        status: "OUT_OF_STOCK",
        buttonState: result.buttonState,
        priceCents: result.currentPriceCents,
      },
      reason: "IN_STOCK -> OUT_OF_STOCK (reset last_notified_at)",
    };
  }

  return {
    patch,
    newStockStatus,
    transitioned: false,
    stockNotification: null,
    insideTxnEvent: null,
    reason: "OUT_OF_STOCK steady",
  };
}

function errorDecision(
  item: Item,
  errorMessage: string,
  now: number,
): DecisionOutput {
  const newConsecutive = item.consecutiveErrors + 1;
  let healthStatus = item.healthStatus;
  if (newConsecutive >= 5) healthStatus = "ERROR";
  else if (newConsecutive >= 3) healthStatus = "DEGRADED";

  // Invalidate stock status when errors persist past the ERROR threshold.
  // Prevents dashboard from showing stale IN_STOCK when scraper is broken.
  const invalidateStock = newConsecutive >= 5;

  // --- Exponential backoff ---
  // After 3 consecutive errors, multiply the check interval so broken SKUs
  // don't get hammered every tick. At 10+, auto-disable entirely.
  //   errors 1-2: normal interval
  //   errors 3-4:  2x interval
  //   errors 5-6:  4x
  //   errors 7-8:  8x
  //   errors 9+:  16x (capped so we never exceed ~16h for interval=1)
  const AUTO_DISABLE_THRESHOLD = 10;
  const autoDisable = newConsecutive >= AUTO_DISABLE_THRESHOLD;

  let nextCheckDueAt: number;
  if (autoDisable) {
    // Push 7 days out — effectively dead unless someone re-enables manually.
    nextCheckDueAt = now + 7 * 24 * 60 * 60 * 1000;
  } else if (newConsecutive >= 3) {
    const mult = Math.min(2 ** (newConsecutive - 2), 16);
    nextCheckDueAt = computeNextCheckDueAt(now, item.checkIntervalMin * mult);
  } else {
    nextCheckDueAt = computeNextCheckDueAt(now, item.checkIntervalMin);
  }

  const patch: Partial<Item> = {
    consecutiveErrors: newConsecutive,
    lastCheckedAt: now,
    nextCheckDueAt,
    updatedAt: now,
    healthStatus,
    lastHealthMessage: errorMessage,
  };

  if (invalidateStock) {
    patch.lastStockStatus = "UNKNOWN";
  }

  if (autoDisable) {
    patch.enabled = 0;
    patch.healthStatus = "ERROR";
    patch.lastHealthMessage = `Auto-disabled after ${newConsecutive} consecutive errors: ${errorMessage}`;
  }

  return {
    patch,
    newStockStatus: invalidateStock
      ? "UNKNOWN"
      : (item.lastStockStatus as StockStatus),
    transitioned: invalidateStock,
    stockNotification: null,
    priceNotification: null,
    notification: null,
    insideTxnEvent: { kind: "error", message: errorMessage },
    priceEvent: null,
    reason: `Error: ${errorMessage} (consecutive_errors=${newConsecutive}, health=${healthStatus})${invalidateStock ? " — stock invalidated to UNKNOWN" : ""}${autoDisable ? " — auto-disabled" : ""}`,
  };
}

/**
 * Decision for SKUs that priceBlocks doesn't index (e.g. items migrated to
 * Best Buy's J-ID commerce platform). These are not failures — the SKU is
 * still live on bestbuy.com, just not addressable via the legacy pricing
 * API. We keep retrying priceBlocks on the normal interval so the item
 * resumes live tracking the moment BB re-indexes it, without spamming
 * ERROR events into the history.
 */
function pendingReindexDecision(
  item: Item,
  errorMessage: string,
  now: number,
): DecisionOutput {
  const transitioning = item.healthStatus !== "PENDING_REINDEX";

  const patch: Partial<Item> = {
    consecutiveErrors: 0,
    lastCheckedAt: now,
    nextCheckDueAt: computeNextCheckDueAt(now, item.checkIntervalMin),
    updatedAt: now,
    healthStatus: "PENDING_REINDEX",
    lastHealthMessage: errorMessage,
  };

  return {
    patch,
    newStockStatus: item.lastStockStatus as StockStatus,
    transitioned: false,
    stockNotification: null,
    priceNotification: null,
    notification: null,
    // Write one event the first time we enter PENDING_REINDEX; stay quiet on
    // subsequent ticks until the SKU either re-indexes or transitions out.
    insideTxnEvent: transitioning
      ? { kind: "info", status: "PENDING_REINDEX", message: errorMessage }
      : null,
    priceEvent: null,
    reason: transitioning
      ? `PENDING_REINDEX entered: ${errorMessage}`
      : `PENDING_REINDEX steady: ${errorMessage}`,
  };
}

function decide(item: Item, result: ProductResult, now: number): DecisionOutput {
  const nextCheckDueAt = computeNextCheckDueAt(now, item.checkIntervalMin);

  if (!result.ok) {
    if (isMissingFromPriceBlocks(result.error)) {
      return pendingReindexDecision(item, result.error, now);
    }
    return errorDecision(item, result.error, now);
  }

  const newStockStatus = interpretStock(result.buttonState);
  if (newStockStatus === "UNKNOWN") {
    const dec = errorDecision(item, "Invalid response shape", now);
    dec.patch.lastButtonState = result.buttonState;
    return dec;
  }

  const stockDec = decideStock(item, result, newStockStatus, now, nextCheckDueAt);
  const priceDec = decidePriceAlert(item, result.currentPriceCents, newStockStatus, now);

  const patch: Partial<Item> = {
    ...stockDec.patch,
    ...priceDec.patch,
  };

  const notification = combineNotifications(stockDec.stockNotification, priceDec.notification);

  const priceEvent =
    priceDec.event == null
      ? null
      : {
          kind: "price_drop" as const,
          mode: priceDec.event.mode,
          buttonState: result.buttonState,
          oldPriceCents: priceDec.event.oldPriceCents,
          newPriceCents: priceDec.event.newPriceCents,
        };

  return {
    patch,
    newStockStatus,
    transitioned: stockDec.transitioned,
    stockNotification: stockDec.stockNotification,
    priceNotification: priceDec.notification,
    notification,
    insideTxnEvent: stockDec.insideTxnEvent,
    priceEvent,
    reason: `${stockDec.reason}; ${priceDec.reason}`,
  };
}

export async function applyCheckResult(
  itemId: number,
  result: ProductResult,
  opts: ApplyOptions = {},
): Promise<CheckOutcome> {
  const db = opts.db ?? getDb();
  const now = opts.now ?? Date.now();
  const resolved =
    opts.webhookUrl !== undefined && opts.webhookUsername !== undefined
      ? { discordWebhookUrl: opts.webhookUrl, discordUsername: opts.webhookUsername }
      : getSettings(db);
  const webhookUrl = opts.webhookUrl ?? resolved.discordWebhookUrl;
  const webhookUsername = opts.webhookUsername ?? resolved.discordUsername;
  const suppressWebhook = opts.suppressWebhook === true;

  let decision: DecisionOutput | null = null;
  let updatedItem: Item | null = null;

  db.transaction(
    (tx) => {
      const fresh = tx
        .select()
        .from(items)
        .where(eq(items.id, itemId))
        .get() as Item | undefined;

      if (!fresh) {
        decision = null;
        return;
      }

      const dec = decide(fresh, result, now);
      decision = dec;

      tx.update(items).set(dec.patch).where(eq(items.id, itemId)).run();

      if (dec.insideTxnEvent) {
        const ev = dec.insideTxnEvent;
        if (ev.kind === "transition") {
          tx.insert(stockEvents)
            .values({
              itemId,
              status: ev.status,
              buttonState: ev.buttonState ?? null,
              priceCents: ev.priceCents ?? null,
              message: null,
              ts: now,
            })
            .run();
        } else if (ev.kind === "info") {
          tx.insert(stockEvents)
            .values({
              itemId,
              status: ev.status,
              buttonState: null,
              priceCents: null,
              message: ev.message,
              ts: now,
            })
            .run();
        } else {
          tx.insert(stockEvents)
            .values({
              itemId,
              status: "ERROR",
              buttonState: null,
              priceCents: null,
              message: ev.message,
              ts: now,
            })
            .run();
        }
      }

      if (dec.priceEvent) {
        tx.insert(stockEvents)
          .values({
            itemId,
            status: "PRICE_DROP",
            buttonState: dec.priceEvent.buttonState ?? null,
            priceCents: dec.priceEvent.newPriceCents,
            message: `${dec.priceEvent.oldPriceCents} -> ${dec.priceEvent.newPriceCents}`,
            ts: now,
          })
          .run();
      }

      updatedItem = tx
        .select()
        .from(items)
        .where(eq(items.id, itemId))
        .get() as Item;
    },
    { behavior: "immediate" },
  );

  if (!decision) {
    return {
      transitioned: false,
      notification: null,
      webhookOk: null,
      reason: "Item not found",
    };
  }

  const dec: DecisionOutput = decision;
  const item: Item | null = updatedItem;

  if (dec.notification == null) {
    return {
      transitioned: dec.transitioned,
      notification: null,
      webhookOk: null,
      reason: dec.reason,
    };
  }

  if (suppressWebhook) {
    return {
      transitioned: dec.transitioned,
      notification: dec.notification,
      webhookOk: null,
      reason: `${dec.reason} (webhook suppressed)`,
    };
  }

  if (!item) {
    return {
      transitioned: dec.transitioned,
      notification: dec.notification,
      webhookOk: false,
      reason: `${dec.reason} (item snapshot missing post-commit)`,
    };
  }

  const ctx = buildAlertContext(item);

  let webhookOk = false;
  let webhookErr: string | null = null;

  if (!webhookUrl) {
    webhookOk = false;
    webhookErr = "missing webhook url";
    console.warn(
      `[checker] item ${itemId}: ${dec.notification} fire skipped — no DISCORD_WEBHOOK_URL configured`,
    );
  } else {
    let send;
    if (dec.notification === "alert") {
      send = await sendRestockAlert(webhookUrl, ctx, webhookUsername);
    } else if (dec.notification === "reminder") {
      send = await sendReminder(webhookUrl, ctx, webhookUsername);
    } else if (dec.priceEvent) {
      const priceCtx: PriceDropContext = {
        ...ctx,
        priceAlertMode: dec.priceEvent.mode,
        oldPriceCents: dec.priceEvent.oldPriceCents,
        currentPriceCents: dec.priceEvent.newPriceCents,
      };
      if (dec.notification === "price_drop") {
        send = await sendPriceDropAlert(webhookUrl, priceCtx, webhookUsername);
      } else {
        send = await sendCombinedAlert(webhookUrl, priceCtx, webhookUsername);
      }
    } else {
      webhookOk = false;
      webhookErr = "price notification dispatched without priceEvent";
      send = null;
    }
    if (send) {
      if (send.ok) {
        webhookOk = true;
      } else {
        webhookOk = false;
        webhookErr = send.error;
      }
    }
  }

  db.transaction(
    (tx) => {
      if (webhookOk) {
        tx.insert(stockEvents)
          .values({
            itemId,
            status: "NOTIFIED",
            buttonState: null,
            priceCents: null,
            message: dec.notification,
            ts: now,
          })
          .run();
      } else {
        tx.insert(stockEvents)
          .values({
            itemId,
            status: "NOTIFIED",
            buttonState: null,
            priceCents: null,
            message: `failed: ${webhookErr ?? "unknown error"}`,
            ts: now,
          })
          .run();

        const fresh = tx
          .select()
          .from(items)
          .where(eq(items.id, itemId))
          .get() as Item | undefined;
        if (fresh && fresh.healthStatus !== "ERROR") {
          tx.update(items)
            .set({
              healthStatus: "DEGRADED",
              lastHealthMessage: `webhook: ${webhookErr ?? "unknown error"}`,
              updatedAt: now,
            })
            .where(eq(items.id, itemId))
            .run();
        }
      }
    },
    { behavior: "immediate" },
  );

  return {
    transitioned: dec.transitioned,
    notification: dec.notification,
    webhookOk,
    reason: dec.reason,
  };
}

function buildAlertContext(item: Item): AlertContext {
  // BB-only path: callers guard on retailer='bestbuy' upstream. sku is
  // guaranteed non-null for BB rows by the partial unique index.
  const sku = item.sku ?? "";
  const ctx: AlertContext = {
    sku,
    name: item.name ?? `SKU ${sku}`,
    currentPriceCents: item.currentPriceCents ?? 0,
    targetPriceCents: item.targetPriceCents ?? undefined,
    buttonState: item.lastButtonState ?? "ADD_TO_CART",
    imageUrl: item.imageUrl ?? imageUrlForSku(sku),
    productUrl: item.productUrl,
    cartUrl: cartUrlForSku(sku),
  };
  if (item.brand) ctx.brand = item.brand;
  if (item.regularPriceCents != null) ctx.regularPriceCents = item.regularPriceCents;
  if (item.note) ctx.note = item.note;
  return ctx;
}

// ─── MicroCenter (per-store) check pipeline (SPEC §21.5) ────────────────────

type StorePatch = Partial<ItemStore> & { id: number };

type StoreDecision = {
  storePatch: StorePatch;
  transitioned: boolean;
  notification: "alert" | "reminder" | null;
  /** Audit row to insert (transition only — steady states write nothing). */
  event:
    | { storeNumber: string; status: "IN_STOCK" | "OUT_OF_STOCK"; qoh: number }
    | null;
  /** Snapshot needed to fire a webhook AFTER the txn commits. */
  notifyCtx:
    | { storeNumber: string; storeName: string; qoh: number; kind: "alert" | "reminder" }
    | null;
  reason: string;
};

function decideStoreStock(
  item: Item,
  store: ItemStore,
  qoh: number,
  now: number,
): StoreDecision {
  const prev = store.lastStockStatus as StockStatus;
  const newStatus: StockStatus = qoh > 0 ? "IN_STOCK" : "OUT_OF_STOCK";

  const base: StorePatch = {
    id: store.id,
    lastQoh: qoh,
    updatedAt: now,
  };

  const stockAlertsOn = item.stockAlertEnabled === 1 && store.alertEnabled === 1;
  const evt = (status: "IN_STOCK" | "OUT_OF_STOCK") => ({
    storeNumber: store.storeNumber,
    status,
    qoh,
  });

  if (prev === "UNKNOWN" && newStatus === "IN_STOCK") {
    base.lastStockStatus = "IN_STOCK";
    base.lastInStockAt = now;
    if (stockAlertsOn) base.lastNotifiedAt = now;
    return {
      storePatch: base,
      transitioned: true,
      notification: stockAlertsOn ? "alert" : null,
      event: evt("IN_STOCK"),
      notifyCtx: stockAlertsOn
        ? { storeNumber: store.storeNumber, storeName: store.storeName, qoh, kind: "alert" }
        : null,
      reason: stockAlertsOn
        ? `${store.storeNumber}: UNKNOWN -> IN_STOCK (first-seen alert)`
        : `${store.storeNumber}: UNKNOWN -> IN_STOCK (alerts off)`,
    };
  }

  if (prev === "UNKNOWN" && newStatus === "OUT_OF_STOCK") {
    base.lastStockStatus = "OUT_OF_STOCK";
    return {
      storePatch: base,
      transitioned: true,
      notification: null,
      event: evt("OUT_OF_STOCK"),
      notifyCtx: null,
      reason: `${store.storeNumber}: UNKNOWN -> OUT_OF_STOCK`,
    };
  }

  if (prev === "OUT_OF_STOCK" && newStatus === "IN_STOCK") {
    base.lastStockStatus = "IN_STOCK";
    base.lastInStockAt = now;
    if (stockAlertsOn) base.lastNotifiedAt = now;
    return {
      storePatch: base,
      transitioned: true,
      notification: stockAlertsOn ? "alert" : null,
      event: evt("IN_STOCK"),
      notifyCtx: stockAlertsOn
        ? { storeNumber: store.storeNumber, storeName: store.storeName, qoh, kind: "alert" }
        : null,
      reason: stockAlertsOn
        ? `${store.storeNumber}: OUT_OF_STOCK -> IN_STOCK (restock)`
        : `${store.storeNumber}: OUT_OF_STOCK -> IN_STOCK (alerts off)`,
    };
  }

  if (prev === "IN_STOCK" && newStatus === "IN_STOCK") {
    const intervalMs = item.restockNotifyIntervalMin * 60_000;
    const last = store.lastNotifiedAt;
    const remindersOn = stockAlertsOn && item.stockNotifyMode === "repeat";
    const dueForReminder = remindersOn && (last == null || now - last >= intervalMs);
    if (dueForReminder) {
      base.lastNotifiedAt = now;
      base.lastInStockAt = now;
      return {
        storePatch: base,
        transitioned: false,
        notification: "reminder",
        event: null,
        notifyCtx: { storeNumber: store.storeNumber, storeName: store.storeName, qoh, kind: "reminder" },
        reason: `${store.storeNumber}: IN_STOCK steady (reminder)`,
      };
    }
    base.lastInStockAt = now;
    return {
      storePatch: base,
      transitioned: false,
      notification: null,
      event: null,
      notifyCtx: null,
      reason: `${store.storeNumber}: IN_STOCK steady`,
    };
  }

  if (prev === "IN_STOCK" && newStatus === "OUT_OF_STOCK") {
    base.lastStockStatus = "OUT_OF_STOCK";
    base.lastNotifiedAt = null;
    return {
      storePatch: base,
      transitioned: true,
      notification: null,
      event: evt("OUT_OF_STOCK"),
      notifyCtx: null,
      reason: `${store.storeNumber}: IN_STOCK -> OUT_OF_STOCK`,
    };
  }

  return {
    storePatch: base,
    transitioned: false,
    notification: null,
    event: null,
    notifyCtx: null,
    reason: `${store.storeNumber}: OUT_OF_STOCK steady`,
  };
}

/**
 * Apply a single MicroCenter check result for one item.
 *
 * Iterates each store entry in the result, applies the per-store state
 * machine (mirrors §7 but keyed on `(item_id, store_number)`), rolls up
 * the item-level `lastStockStatus` from enabled-store states, applies
 * the shared price-alert logic at the item level, then fires per-store
 * webhooks AFTER the DB transaction commits.
 */
export async function applyMicroCenterCheckResult(
  itemId: number,
  result: McProductResult,
  opts: ApplyOptions = {},
): Promise<CheckOutcome> {
  const db = opts.db ?? getDb();
  const now = opts.now ?? Date.now();
  const resolved =
    opts.webhookUrl !== undefined && opts.webhookUsername !== undefined
      ? { discordWebhookUrl: opts.webhookUrl, discordUsername: opts.webhookUsername }
      : getSettings(db);
  const webhookUrl = opts.webhookUrl ?? resolved.discordWebhookUrl;
  const webhookUsername = opts.webhookUsername ?? resolved.discordUsername;
  const suppressWebhook = opts.suppressWebhook === true;

  // ─── Error path: bubble through the item-level error decision ────────────
  if (!result.ok) {
    const errOutcome = await applyItemLevelError(itemId, result.error, now, db);
    return errOutcome;
  }

  type Notify = {
    storeNumber: string;
    storeName: string;
    qoh: number;
    kind: "alert" | "reminder";
  };
  let updatedItem: Item | null = null;
  let storeDecs: StoreDecision[] = [];
  let priceDec: ReturnType<typeof decidePriceAlert> | null = null;
  let priceEvent:
    | {
        kind: "price_drop";
        mode: "target" | "drop";
        oldPriceCents: number;
        newPriceCents: number;
      }
    | null = null;
  let anyEnabledInStock = false;

  db.transaction(
    (tx) => {
      const fresh = tx
        .select()
        .from(items)
        .where(eq(items.id, itemId))
        .get() as Item | undefined;
      if (!fresh) return;

      const existing = tx
        .select()
        .from(itemStores)
        .where(eq(itemStores.itemId, itemId))
        .all() as ItemStore[];
      const byStore = new Map(existing.map((s) => [s.storeNumber, s]));

      const decisions: StoreDecision[] = [];
      for (const incoming of result.stores) {
        let store = byStore.get(incoming.storeNumber);
        if (!store) {
          // First time we've seen this store for this item — auto-create.
          // alertEnabled defaults to 1 (user can opt out via UI).
          const isOnline = incoming.storeNumber === "029" ? 1 : 0;
          tx.insert(itemStores)
            .values({
              itemId,
              storeNumber: incoming.storeNumber,
              storeName: incoming.storeName,
              isOnline,
              alertEnabled: 1,
              lastStockStatus: "UNKNOWN",
              createdAt: now,
              updatedAt: now,
            })
            .run();
          store = tx
            .select()
            .from(itemStores)
            .where(
              and(
                eq(itemStores.itemId, itemId),
                eq(itemStores.storeNumber, incoming.storeNumber),
              ),
            )
            .get() as ItemStore;
          byStore.set(incoming.storeNumber, store);
        }
        const dec = decideStoreStock(fresh, store, incoming.qoh, now);
        decisions.push(dec);

        tx.update(itemStores)
          .set(dec.storePatch)
          .where(eq(itemStores.id, store.id))
          .run();

        if (dec.event) {
          tx.insert(stockEvents)
            .values({
              itemId,
              status: dec.event.status,
              buttonState: null,
              priceCents: result.currentPriceCents,
              message: null,
              storeNumber: dec.event.storeNumber,
              ts: now,
            })
            .run();
        }
      }

      // Roll-up: item.lastStockStatus = IN_STOCK if any enabled store has stock.
      // Compute against the just-updated state.
      const refreshed = tx
        .select()
        .from(itemStores)
        .where(eq(itemStores.itemId, itemId))
        .all() as ItemStore[];
      anyEnabledInStock = refreshed.some(
        (s) => s.alertEnabled === 1 && s.lastStockStatus === "IN_STOCK",
      );
      const rolledStock: StockStatus = anyEnabledInStock ? "IN_STOCK" : "OUT_OF_STOCK";

      // Item-level price-alert decision (shared with BB).
      const pd = decidePriceAlert(fresh, result.currentPriceCents, rolledStock, now);
      priceDec = pd;
      const ipatch: Partial<Item> = {
        name: result.name,
        brand: result.brand ?? null,
        imageUrl: result.imageUrl ?? null,
        productUrl: result.canonicalUrl,
        currentPriceCents: result.currentPriceCents,
        lastStockStatus: rolledStock,
        lastCheckedAt: now,
        nextCheckDueAt: computeNextCheckDueAt(now, fresh.checkIntervalMin),
        consecutiveErrors: 0,
        healthStatus: "OK",
        lastHealthMessage: null,
        updatedAt: now,
        ...pd.patch,
      };
      if (anyEnabledInStock) ipatch.lastInStockAt = now;

      tx.update(items).set(ipatch).where(eq(items.id, itemId)).run();

      if (pd.event) {
        priceEvent = {
          kind: "price_drop",
          mode: pd.event.mode,
          oldPriceCents: pd.event.oldPriceCents,
          newPriceCents: pd.event.newPriceCents,
        };
        tx.insert(stockEvents)
          .values({
            itemId,
            status: "PRICE_DROP",
            buttonState: null,
            priceCents: pd.event.newPriceCents,
            message: `${pd.event.oldPriceCents} -> ${pd.event.newPriceCents}`,
            storeNumber: null,
            ts: now,
          })
          .run();
      }

      updatedItem = tx.select().from(items).where(eq(items.id, itemId)).get() as Item;
      storeDecs = decisions;
    },
    { behavior: "immediate" },
  );

  if (!updatedItem) {
    return { transitioned: false, notification: null, webhookOk: null, reason: "Item not found" };
  }

  const notifications: Notify[] = storeDecs
    .map((d) => d.notifyCtx)
    .filter((n): n is Notify => n !== null);
  const anyStoreNotif = notifications.length > 0;
  const anyTransition = storeDecs.some((d) => d.transitioned);
  const reason = storeDecs.map((d) => d.reason).join("; ");

  if (!anyStoreNotif && priceEvent == null) {
    return {
      transitioned: anyTransition,
      notification: null,
      webhookOk: null,
      reason,
    };
  }

  const aggregateKind: NotificationKind = anyStoreNotif && priceEvent
    ? "combined"
    : anyStoreNotif
      ? (storeDecs.some((d) => d.notification === "alert") ? "alert" : "reminder")
      : "price_drop";

  if (suppressWebhook) {
    return {
      transitioned: anyTransition,
      notification: aggregateKind,
      webhookOk: null,
      reason: `${reason} (webhook suppressed)`,
    };
  }

  const item: Item = updatedItem;
  let allOk: boolean | null = null;
  const sends: Array<{ kind: string; ok: boolean; error?: string }> = [];

  if (!webhookUrl) {
    console.warn(`[checker mc] item ${itemId}: notifications skipped — no DISCORD_WEBHOOK_URL configured`);
  } else {
    // Fire per-store stock notifications.
    for (const n of notifications) {
      const ctx = buildMicroCenterAlertContext(item, n.storeNumber, n.storeName, n.qoh);
      const send = n.kind === "alert"
        ? await sendRestockAlert(webhookUrl, ctx, webhookUsername)
        : await sendReminder(webhookUrl, ctx, webhookUsername);
      sends.push({
        kind: `${n.kind}:${n.storeNumber}`,
        ok: send.ok,
        error: send.ok ? undefined : send.error,
      });
    }
    // Fire item-level price-drop (independent of per-store stock).
    // TS doesn't track closure mutations, so re-widen the captured value.
    type PEvt = { kind: "price_drop"; mode: "target" | "drop"; oldPriceCents: number; newPriceCents: number };
    const pevt = priceEvent as PEvt | null;
    if (pevt != null) {
      const baseCtx = buildMicroCenterAlertContext(item);
      const priceCtx: PriceDropContext = {
        ...baseCtx,
        priceAlertMode: pevt.mode,
        oldPriceCents: pevt.oldPriceCents,
        currentPriceCents: pevt.newPriceCents,
      };
      const send = anyStoreNotif
        ? await sendCombinedAlert(webhookUrl, priceCtx, webhookUsername)
        : await sendPriceDropAlert(webhookUrl, priceCtx, webhookUsername);
      sends.push({ kind: "price_drop", ok: send.ok, error: send.ok ? undefined : send.error });
    }
    allOk = sends.every((s) => s.ok);
  }

  // NOTIFIED audit rows + degraded marker on failure.
  db.transaction(
    (tx) => {
      for (const s of sends) {
        tx.insert(stockEvents)
          .values({
            itemId,
            status: "NOTIFIED",
            buttonState: null,
            priceCents: null,
            message: s.ok ? s.kind : `failed: ${s.error ?? "unknown"} (${s.kind})`,
            storeNumber: null,
            ts: now,
          })
          .run();
      }
      if (allOk === false) {
        const fresh = tx.select().from(items).where(eq(items.id, itemId)).get() as Item | undefined;
        if (fresh && fresh.healthStatus !== "ERROR") {
          tx.update(items)
            .set({
              healthStatus: "DEGRADED",
              lastHealthMessage: `webhook: one or more sends failed`,
              updatedAt: now,
            })
            .where(eq(items.id, itemId))
            .run();
        }
      }
    },
    { behavior: "immediate" },
  );

  return {
    transitioned: anyTransition,
    notification: aggregateKind,
    webhookOk: allOk,
    reason,
  };
}

/**
 * Item-level error decision for MC fetches. Mirrors the BB `errorDecision`
 * shape but doesn't touch per-store rows (those stay at their last-known
 * state — we don't have fresh data for them).
 */
async function applyItemLevelError(
  itemId: number,
  errorMessage: string,
  now: number,
  db: ReturnType<typeof getDb>,
): Promise<CheckOutcome> {
  let reason = "";
  db.transaction(
    (tx) => {
      const fresh = tx.select().from(items).where(eq(items.id, itemId)).get() as Item | undefined;
      if (!fresh) return;
      const newConsecutive = fresh.consecutiveErrors + 1;
      let healthStatus = fresh.healthStatus;
      if (newConsecutive >= 5) healthStatus = "ERROR";
      else if (newConsecutive >= 3) healthStatus = "DEGRADED";

      const AUTO_DISABLE_THRESHOLD = 10;
      const autoDisable = newConsecutive >= AUTO_DISABLE_THRESHOLD;
      let nextCheckDueAt: number;
      if (autoDisable) {
        nextCheckDueAt = now + 7 * 24 * 60 * 60 * 1000;
      } else if (newConsecutive >= 3) {
        const mult = Math.min(2 ** (newConsecutive - 2), 16);
        nextCheckDueAt = computeNextCheckDueAt(now, fresh.checkIntervalMin * mult);
      } else {
        nextCheckDueAt = computeNextCheckDueAt(now, fresh.checkIntervalMin);
      }

      const patch: Partial<Item> = {
        consecutiveErrors: newConsecutive,
        lastCheckedAt: now,
        nextCheckDueAt,
        updatedAt: now,
        healthStatus,
        lastHealthMessage: errorMessage,
      };
      if (newConsecutive >= 5) patch.lastStockStatus = "UNKNOWN";
      if (autoDisable) {
        patch.enabled = 0;
        patch.healthStatus = "ERROR";
        patch.lastHealthMessage = `Auto-disabled after ${newConsecutive} consecutive errors: ${errorMessage}`;
      }
      tx.update(items).set(patch).where(eq(items.id, itemId)).run();
      tx.insert(stockEvents)
        .values({
          itemId,
          status: "ERROR",
          buttonState: null,
          priceCents: null,
          message: errorMessage,
          storeNumber: null,
          ts: now,
        })
        .run();
      reason = `MC error: ${errorMessage} (consecutive=${newConsecutive}, health=${healthStatus})${autoDisable ? " — auto-disabled" : ""}`;
    },
    { behavior: "immediate" },
  );
  return { transitioned: false, notification: null, webhookOk: null, reason };
}

function buildMicroCenterAlertContext(
  item: Item,
  storeNumber?: string,
  storeName?: string,
  qoh?: number,
): AlertContext {
  const productId = item.mcProductId ?? "";
  const deepLink = storeNumber
    ? microcenterPdpUrl(productId, storeNumber)
    : microcenterPdpUrl(productId);
  const displayName = item.name ?? `MC ${productId}`;
  const displayStoreName = storeName === "Shippable Items" ? "Online (Shippable)" : storeName;

  const ctx: AlertContext = {
    sku: productId,
    name: displayName,
    currentPriceCents: item.currentPriceCents ?? 0,
    targetPriceCents: item.targetPriceCents ?? undefined,
    buttonState: "MICROCENTER",
    imageUrl: item.imageUrl ?? "",
    productUrl: deepLink,
    cartUrl: deepLink,
    retailer: "microcenter",
  };
  if (displayStoreName) ctx.storeName = displayStoreName;
  if (qoh != null) ctx.qoh = qoh;
  if (item.brand) ctx.brand = item.brand;
  if (item.note) ctx.note = item.note;
  return ctx;
}
