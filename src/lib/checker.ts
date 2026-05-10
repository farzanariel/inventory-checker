/**
 * Shared transactional check pipeline (SPEC §7, §7.5, §9.1).
 *
 * The Best Buy fetch happens BEFORE this is called — never inside the
 * transaction. This file is the single source of truth for what one
 * `ProductResult` does to one `items` row.
 *
 * Pipeline (per item):
 *   1. (caller) fetchProducts(...) — outside any DB lock
 *   2. BEGIN IMMEDIATE
 *   3. SELECT items WHERE id = ?
 *   4. Decide new state + notification intent
 *   5. UPDATE items
 *   6. INSERT stock_events row(s) for transitions/errors
 *   7. COMMIT
 *   8. (post-commit) Fire Discord webhook if intent != null
 *   9. (post-commit) Insert NOTIFIED audit row recording webhook outcome
 *
 * Re-reading the row inside the transaction is the dedupe guarantee against
 * concurrent worker-vs-check-now invocations: the second caller observes the
 * first caller's `last_notified_at` and downgrades 'alert' → null.
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
  sendReminder,
  sendRestockAlert,
  type AlertContext,
} from "./discord";
import { getSettings } from "./settings";

export type CheckOutcome = {
  /** Stock state changed compared to last_stock_status */
  transitioned: boolean;
  /** Notification fired post-commit (or attempted to) */
  notification: "alert" | "reminder" | null;
  /** Whether the post-commit webhook send succeeded — null if no webhook attempted */
  webhookOk: boolean | null;
  /** Human-readable explanation, useful for logs and tests */
  reason: string;
};

export type ApplyOptions = {
  /** Override the drizzle db (used in tests with in-memory SQLite). Defaults to getDb(). */
  db?: ReturnType<typeof getDb>;
  /** Override "now" timestamp (unix ms). Defaults to Date.now(). */
  now?: number;
  /** Override webhook URL. Defaults to settings (DB → env fallback). */
  webhookUrl?: string;
  /** Override webhook username. Defaults to settings (DB → built-in default). */
  webhookUsername?: string;
  /** Suppress the post-commit webhook fire (used in tests). Default false. */
  suppressWebhook?: boolean;
};

/**
 * Compute next_check_due_at with ±10% jitter applied to the per-item interval.
 * Formula: now + intervalMin * 60_000 * (0.9 + Math.random() * 0.2)
 */
export function computeNextCheckDueAt(
  now: number,
  checkIntervalMin: number,
): number {
  const jitter = 0.9 + Math.random() * 0.2;
  return now + Math.round(checkIntervalMin * 60_000 * jitter);
}

type DecisionOutput = {
  /** Patch to apply via UPDATE items SET ... */
  patch: Partial<Item>;
  /** New stock_status post-decision (used to detect transition) */
  newStockStatus: StockStatus;
  /** Did stock_status actually change vs. fresh row? */
  transitioned: boolean;
  /** Intended notification (pre-webhook) */
  notification: "alert" | "reminder" | null;
  /** Should we insert a transition / error stock_events row inside the txn? */
  insideTxnEvent:
    | { kind: "transition"; status: StockStatus; buttonState?: string; priceCents?: number }
    | { kind: "error"; message: string }
    | null;
  reason: string;
};

/**
 * Pure decision function — no DB. Given the fresh row + just-fetched result,
 * compute the patch + transition + notification intent.
 */
function decide(item: Item, result: ProductResult, now: number): DecisionOutput {
  const nextCheckDueAt = computeNextCheckDueAt(now, item.checkIntervalMin);

  // Result shape error / invalid SKU — same handling as a network failure (§6.5/§6.6).
  // Also: if buttonState is unknown, treat as ERROR (don't corrupt stock state).
  if (!result.ok) {
    return errorDecision(item, result.error, now, nextCheckDueAt);
  }

  const newStockStatus = interpretStock(result.buttonState);
  if (newStockStatus === "UNKNOWN") {
    // Got data but buttonState is unrecognized — treat as ERROR but record button_state for diagnostics.
    const dec = errorDecision(item, "Invalid response shape", now, nextCheckDueAt);
    dec.patch.lastButtonState = result.buttonState;
    return dec;
  }

  // Got a fresh, parseable result.
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

  // State transitions
  if (prev === "UNKNOWN" && newStockStatus === "IN_STOCK") {
    patch.lastStockStatus = "IN_STOCK";
    patch.lastInStockAt = now;
    patch.lastNotifiedAt = now;
    return {
      patch,
      newStockStatus,
      transitioned: true,
      notification: "alert",
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
      notification: null,
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
      notification: "alert",
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
    // Steady state in stock — possible reminder.
    const intervalMs = item.restockNotifyIntervalMin * 60_000;
    const last = item.lastNotifiedAt;
    const dueForReminder =
      last == null || now - last >= intervalMs;

    if (dueForReminder) {
      patch.lastNotifiedAt = now;
      patch.lastInStockAt = now;
      return {
        patch,
        newStockStatus,
        transitioned: false,
        notification: "reminder",
        insideTxnEvent: null,
        reason: "IN_STOCK steady (reminder window elapsed)",
      };
    }

    patch.lastInStockAt = now;
    return {
      patch,
      newStockStatus,
      transitioned: false,
      notification: null,
      insideTxnEvent: null,
      reason: "IN_STOCK steady (within reminder window)",
    };
  }

  if (prev === "IN_STOCK" && newStockStatus === "OUT_OF_STOCK") {
    patch.lastStockStatus = "OUT_OF_STOCK";
    patch.lastNotifiedAt = null; // reset so next out->in fires immediately
    return {
      patch,
      newStockStatus,
      transitioned: true,
      notification: null,
      insideTxnEvent: {
        kind: "transition",
        status: "OUT_OF_STOCK",
        buttonState: result.buttonState,
        priceCents: result.currentPriceCents,
      },
      reason: "IN_STOCK -> OUT_OF_STOCK (reset last_notified_at)",
    };
  }

  // OUT_OF_STOCK -> OUT_OF_STOCK (steady-state OOS, no event)
  return {
    patch,
    newStockStatus,
    transitioned: false,
    notification: null,
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
    notification: null,
    insideTxnEvent: { kind: "error", message: errorMessage },
    reason: `Error: ${errorMessage} (consecutive_errors=${newConsecutive}, health=${healthStatus})`,
  };
}

/**
 * Apply a single product check result to the database for one item.
 * Pipeline: BEGIN IMMEDIATE → re-read item → decide → update → insert event(s) → COMMIT → fire webhook.
 * The Best Buy fetch happens BEFORE this is called — never inside the transaction (per SPEC §7.5).
 */
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

  // ---- main transaction: read-decide-write-events-COMMIT ----
  // Drizzle's better-sqlite3 driver maps `behavior: 'immediate'` to
  // `betterSqliteTransaction.immediate(tx)`, which issues `BEGIN IMMEDIATE`.
  // See: drizzle-orm/better-sqlite3/session.js line 40 —
  //   `return nativeTx[config.behavior ?? "deferred"](tx);`
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
        // Item was deleted between fetch and apply. Bail out cleanly.
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

      // Re-read the post-update row so we have a coherent snapshot for the webhook.
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

  // Decision is non-null below; assert for TS.
  const dec: DecisionOutput = decision;
  const item: Item | null = updatedItem;

  // ---- post-commit webhook fire (if any) ----
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
    // Should not happen — we just updated it. Defensive.
    return {
      transitioned: dec.transitioned,
      notification: dec.notification,
      webhookOk: false,
      reason: `${dec.reason} (item snapshot missing post-commit)`,
    };
  }

  const ctx = buildAlertContext(item);

  let webhookOk: boolean;
  let webhookErr: string | null = null;

  if (!webhookUrl) {
    webhookOk = false;
    webhookErr = "missing webhook url";
    console.warn(
      `[checker] item ${itemId}: ${dec.notification} fire skipped — no DISCORD_WEBHOOK_URL configured`,
    );
  } else {
    const send =
      dec.notification === "alert"
        ? await sendRestockAlert(webhookUrl, ctx, webhookUsername)
        : await sendReminder(webhookUrl, ctx, webhookUsername);
    if (send.ok) {
      webhookOk = true;
    } else {
      webhookOk = false;
      webhookErr = send.error;
    }
  }

  // ---- post-webhook: log NOTIFIED row + (on failure) bump health ----
  // Use a small second transaction; the main work has already committed so this is
  // a separate atomic logging step that cannot affect stock state.
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

        // Bump health to DEGRADED only if not already at ERROR (don't downgrade).
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
