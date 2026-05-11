import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

/**
 * items — watchlist of Best Buy SKUs (SPEC §9)
 */
export const items = sqliteTable(
  'items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sku: text('sku').notNull().unique(),
    name: text('name'),
    brand: text('brand'),
    imageUrl: text('image_url'),
    productUrl: text('product_url').notNull(),
    currentPriceCents: integer('current_price_cents'),
    regularPriceCents: integer('regular_price_cents'),
    checkIntervalMin: integer('check_interval_min').notNull().default(1),
    restockNotifyIntervalMin: integer('restock_notify_interval_min')
      .notNull()
      .default(10),
    enabled: integer('enabled').notNull().default(1),
    note: text('note'),
    // separated status fields (per Codex round-1)
    lastStockStatus: text('last_stock_status').notNull().default('UNKNOWN'),
    lastButtonState: text('last_button_state'),
    healthStatus: text('health_status').notNull().default('OK'),
    lastHealthMessage: text('last_health_message'),
    consecutiveErrors: integer('consecutive_errors').notNull().default(0),
    // timestamps (unix ms)
    lastCheckedAt: integer('last_checked_at'),
    lastInStockAt: integer('last_in_stock_at'),
    lastNotifiedAt: integer('last_notified_at'),
    nextCheckDueAt: integer('next_check_due_at'),
    // Price-alert config (SPEC §19; target-price model — replaces v4 threshold-based rev)
    priceAlertEnabled: integer('price_alert_enabled').notNull().default(1),
    targetPriceCents: integer('target_price_cents'),
    priceNotifyIntervalMin: integer('price_notify_interval_min')
      .notNull()
      .default(60),
    lastPriceNotifiedAt: integer('last_price_notified_at'),
    priceAlertWhileOos: integer('price_alert_while_oos').notNull().default(1),
    // Stale-price guard — kept; same flicker defense as v4 but keyed off "at or below target"
    pendingHitPriceCents: integer('pending_hit_price_cents'),
    pendingHitSeenCount: integer('pending_hit_seen_count')
      .notNull()
      .default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_items_due').on(table.enabled, table.nextCheckDueAt),
  ],
);

/**
 * stock_events — audit log of significant events (SPEC §9.1)
 * Insert only on transitions, errors, or notification attempts — NOT every poll.
 */
export const stockEvents = sqliteTable(
  'stock_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    buttonState: text('button_state'),
    priceCents: integer('price_cents'),
    message: text('message'),
    ts: integer('ts').notNull(),
  },
  (table) => [
    index('idx_events_item_ts').on(table.itemId, sql`${table.ts} DESC`),
  ],
);

/**
 * worker_heartbeat — single-row table; SPEC §9.1
 */
export const workerHeartbeat = sqliteTable(
  'worker_heartbeat',
  {
    id: integer('id').primaryKey(),
    lastTickAt: integer('last_tick_at').notNull(),
    itemsCheckedLast: integer('items_checked_last').notNull().default(0),
    errorsLast: integer('errors_last').notNull().default(0),
    workerVersion: text('worker_version'),
  },
  (table) => [check('worker_heartbeat_singleton', sql`${table.id} = 1`)],
);

/**
 * settings — single-row table (id=1) for user-editable runtime config.
 * Values are nullable; NULL means "fall back to env / built-in default".
 */
export const settings = sqliteTable(
  'settings',
  {
    id: integer('id').primaryKey(),
    discordWebhookUrl: text('discord_webhook_url'),
    discordUsername: text('discord_username'),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [check('settings_singleton', sql`${table.id} = 1`)],
);

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type StockEvent = typeof stockEvents.$inferSelect;
export type NewStockEvent = typeof stockEvents.$inferInsert;
export type WorkerHeartbeat = typeof workerHeartbeat.$inferSelect;
export type NewWorkerHeartbeat = typeof workerHeartbeat.$inferInsert;
export type Settings = typeof settings.$inferSelect;
export type NewSettings = typeof settings.$inferInsert;
