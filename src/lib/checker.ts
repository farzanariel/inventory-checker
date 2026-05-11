/**
 * Shared transactional check pipeline (SPEC §7, §7.5, §9.1).
 *
 * The Best Buy fetch happens BEFORE this is called — never inside the
 * transaction. This file is the single source of truth for what one
 * `ProductResult` does to one `items` row.
 */

import { eq } from "drizzle-orm";
import { items, stockEvents, type Item } from "./db/schema";
import { getDb } from "./db/client";
import {
  imageUrlForSku,
  interpretStock,
  productUrlForSku,
  cartUrlForSku,
  type ProductResult,
  type StockStatus,
} from "./bestbuy";
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
    | { kind: "price_drop"; oldPriceCents: number; newPriceCents: number }
    | null;
};

function combineNotifications(
  stockNotification: "alert" | "reminder" | null,
  priceNotification: "price_drop" | null,
): NotificationKind {
  if (stockNotification && priceNotification) return "combined";
  return stockNotification ?? priceNotification;
}

export function decidePriceAlert(
  item: Item,
  currentPriceCents: number,
  newStockStatus: StockStatus,
  now: number,
): PriceAlertDecision {
  if (item.priceAlertEnabled !== 1) {
    return {
      patch: {
        pendingLowerPriceCents: null,
        pendingLowerSeenCount: 0,
      },
      notification: null,
      reason: "price alerts disabled",
      event: null,
    };
  }

  if (item.baselinePriceCents == null) {
    return {
      patch: {
        baselinePriceCents: currentPriceCents,
        baselineSetAt: now,
        pendingLowerPriceCents: null,
        pendingLowerSeenCount: 0,
      },
      notification: null,
      reason: "price baseline initialized",
      event: null,
    };
  }

  const baseline = item.baselinePriceCents;
  if (currentPriceCents >= baseline) {
    return {
      patch: {
        pendingLowerPriceCents: null,
        pendingLowerSeenCount: 0,
      },
      notification: null,
      reason: "candidate >= baseline",
      event: null,
    };
  }

  const pctThreshold = Math.round((baseline * item.priceDropThresholdPct) / 100);
  const threshold = Math.max(pctThreshold, item.priceDropThresholdCents);
  const delta = baseline - currentPriceCents;

  const trackCandidate = (): Partial<Item> => {
    const prev = item.pendingLowerPriceCents;
    if (prev !== currentPriceCents) {
      return {
        pendingLowerPriceCents: currentPriceCents,
        pendingLowerSeenCount: 1,
      };
    }
    return {
      pendingLowerPriceCents: currentPriceCents,
      pendingLowerSeenCount: item.pendingLowerSeenCount + 1,
    };
  };

  if (delta < threshold) {
    return {
      patch: trackCandidate(),
      notification: null,
      reason: "price drop below threshold",
      event: null,
    };
  }

  const cooldownMs = item.priceNotifyIntervalMin * 60_000;
  const inCooldown =
    item.lastPriceNotifiedAt != null && now - item.lastPriceNotifiedAt < cooldownMs;
  const suppressWhileOos = item.priceAlertWhileOos !== 1 && newStockStatus === "OUT_OF_STOCK";

  if (inCooldown || suppressWhileOos) {
    return {
      patch: trackCandidate(),
      notification: null,
      reason: inCooldown ? "price cooldown active" : "price alerts suppressed while OOS",
      event: null,
    };
  }

  if (item.pendingLowerPriceCents !== currentPriceCents) {
    return {
      patch: {
        pendingLowerPriceCents: currentPriceCents,
        pendingLowerSeenCount: 1,
      },
      notification: null,
      reason: "price candidate first hit",
      event: null,
    };
  }

  if (item.pendingLowerSeenCount + 1 < 2) {
    return {
      patch: {
        pendingLowerPriceCents: currentPriceCents,
        pendingLowerSeenCount: item.pendingLowerSeenCount + 1,
      },
      notification: null,
      reason: "price candidate awaiting second consecutive hit",
      event: null,
    };
  }

  return {
    patch: {
      baselinePriceCents: currentPriceCents,
      baselineSetAt: now,
      lastPriceNotifiedAt: now,
      pendingLowerPriceCents: null,
      pendingLowerSeenCount: 0,
    },
    notification: "price_drop",
    reason: "price drop threshold met and confirmed",
    event: {
      kind: "price_drop",
      oldPriceCents: baseline,
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
    imageUrl: imageUrlForSku(item.sku),
    productUrl: result.canonicalUrl ?? productUrlForSku(item.sku),
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

  if (prev === "UNKNOWN" && newStockStatus === "IN_STOCK") {
    patch.lastStockStatus = "IN_STOCK";
    patch.lastInStockAt = now;
    patch.lastNotifiedAt = now;
    return {
      patch,
      newStockStatus,
      transitioned: true,
      stockNotification: "alert",
      insideTxnEvent: {
        kind: "transition",
        status: "IN_STOCK",
        buttonState: result.buttonState,
        priceCents: result.currentPriceCents,
      },
      reason: "UNKNOWN -> IN_STOCK (first-seen alert)",
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
    patch.lastNotifiedAt = now;
    return {
      patch,
      newStockStatus,
      transitioned: true,
      stockNotification: "alert",
      insideTxnEvent: {
        kind: "transition",
        status: "IN_STOCK",
        buttonState: result.buttonState,
        priceCents: result.currentPriceCents,
      },
      reason: "OUT_OF_STOCK -> IN_STOCK (restock alert)",
    };
  }

  if (prev === "IN_STOCK" && newStockStatus === "IN_STOCK") {
    const intervalMs = item.restockNotifyIntervalMin * 60_000;
    const last = item.lastNotifiedAt;
    const dueForReminder = last == null || now - last >= intervalMs;

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
  nextCheckDueAt: number,
): DecisionOutput {
  const newConsecutive = item.consecutiveErrors + 1;
  let healthStatus = item.healthStatus;
  if (newConsecutive >= 5) healthStatus = "ERROR";
  else if (newConsecutive >= 3) healthStatus = "DEGRADED";

  const patch: Partial<Item> = {
    consecutiveErrors: newConsecutive,
    lastCheckedAt: now,
    nextCheckDueAt,
    updatedAt: now,
    healthStatus,
    lastHealthMessage: errorMessage,
  };

  return {
    patch,
    newStockStatus: item.lastStockStatus as StockStatus,
    transitioned: false,
    stockNotification: null,
    priceNotification: null,
    notification: null,
    insideTxnEvent: { kind: "error", message: errorMessage },
    priceEvent: null,
    reason: `Error: ${errorMessage} (consecutive_errors=${newConsecutive}, health=${healthStatus})`,
  };
}

function decide(item: Item, result: ProductResult, now: number): DecisionOutput {
  const nextCheckDueAt = computeNextCheckDueAt(now, item.checkIntervalMin);

  if (!result.ok) {
    return errorDecision(item, result.error, now, nextCheckDueAt);
  }

  const newStockStatus = interpretStock(result.buttonState);
  if (newStockStatus === "UNKNOWN") {
    const dec = errorDecision(item, "Invalid response shape", now, nextCheckDueAt);
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
        if (dec.insideTxnEvent.kind === "transition") {
          tx.insert(stockEvents)
            .values({
              itemId,
              status: dec.insideTxnEvent.status,
              buttonState: dec.insideTxnEvent.buttonState ?? null,
              priceCents: dec.insideTxnEvent.priceCents ?? null,
              message: null,
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
              message: dec.insideTxnEvent.message,
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
    } else if (dec.notification === "price_drop") {
      if (ctx.baselinePriceCents == null) {
        webhookOk = false;
        webhookErr = "missing baseline for price alert";
        send = null;
      } else {
        send = await sendPriceDropAlert(webhookUrl, ctx as PriceDropContext, webhookUsername);
      }
    } else {
      if (ctx.baselinePriceCents == null) {
        webhookOk = false;
        webhookErr = "missing baseline for combined alert";
        send = null;
      } else {
        send = await sendCombinedAlert(webhookUrl, ctx as PriceDropContext, webhookUsername);
      }
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
  const ctx: AlertContext = {
    sku: item.sku,
    name: item.name ?? `SKU ${item.sku}`,
    currentPriceCents: item.currentPriceCents ?? 0,
    baselinePriceCents: item.baselinePriceCents ?? undefined,
    buttonState: item.lastButtonState ?? "ADD_TO_CART",
    imageUrl: item.imageUrl ?? imageUrlForSku(item.sku),
    productUrl: item.productUrl,
    cartUrl: cartUrlForSku(item.sku),
  };
  if (item.brand) ctx.brand = item.brand;
  if (item.regularPriceCents != null) ctx.regularPriceCents = item.regularPriceCents;
  if (item.note) ctx.note = item.note;
  return ctx;
}
