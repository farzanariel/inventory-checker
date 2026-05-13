import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * items — watchlist of products (SPEC §9, §21).
 *
 * `retailer` discriminates between Best Buy and MicroCenter. For BB,
 * `sku` holds the numeric SKU and `mcProductId` is NULL. For MC, `sku`
 * is NULL and `mcProductId` holds the 6-digit product ID from the URL.
 * Per-retailer uniqueness is enforced via partial unique indexes below
 * (`idx_items_bb_sku`, `idx_items_mc_pid`).
 */
export const items = sqliteTable(
  'items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    retailer: text('retailer').notNull().default('bestbuy'),
    sku: text('sku'),
    mcProductId: text('mc_product_id'),
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
    // Stock-alert config. `stockAlertEnabled` toggles the whole stock-watch
    // feature for an item (mirrors `priceAlertEnabled`). `stockNotifyMode`:
    //   'repeat' — re-ping every restockNotifyIntervalMin while in stock
    //   'once'   — fire on the OOS→IN_STOCK transition only, no reminders
    stockAlertEnabled: integer('stock_alert_enabled').notNull().default(1),
    stockNotifyMode: text('stock_notify_mode').notNull().default('repeat'),
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
    // 'repeat' — re-ping every priceNotifyIntervalMin while the hit holds
    // 'once'   — fire on the first confirmed hit, then go quiet
    priceNotifyMode: text('price_notify_mode').notNull().default('repeat'),
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
    uniqueIndex('idx_items_bb_sku')
      .on(table.sku)
      .where(sql`${table.retailer} = 'bestbuy'`),
    uniqueIndex('idx_items_mc_pid')
      .on(table.mcProductId)
      .where(sql`${table.retailer} = 'microcenter'`),
  ],
);

/**
 * item_stores — per-(item, store) state for MicroCenter items (SPEC §21.5, §21.6).
 *
 * Only populated for items where retailer='microcenter'. Each MC item gets
 * ~32 rows on creation, one per known store. `alertEnabled` is the per-store
 * opt-in toggle exposed in the UI. The state-machine fields mirror the §7
 * shape but key on (itemId, storeNumber).
 */
export const itemStores = sqliteTable(
  'item_stores',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    storeNumber: text('store_number').notNull(),
    storeName: text('store_name').notNull(),
    isOnline: integer('is_online').notNull().default(0),
    alertEnabled: integer('alert_enabled').notNull().default(1),
    lastQoh: integer('last_qoh'),
    lastStockStatus: text('last_stock_status').notNull().default('UNKNOWN'),
    lastInStockAt: integer('last_in_stock_at'),
    lastNotifiedAt: integer('last_notified_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_item_stores_item_store').on(table.itemId, table.storeNumber),
    index('idx_item_stores_item').on(table.itemId),
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
    // For MC per-store events, the store_number this event refers to.
    // NULL for BB events and for item-level MC events (e.g. ERROR).
    storeNumber: text('store_number'),
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
export type ItemStore = typeof itemStores.$inferSelect;
export type NewItemStore = typeof itemStores.$inferInsert;
export type StockEvent = typeof stockEvents.$inferSelect;
export type NewStockEvent = typeof stockEvents.$inferInsert;
export type WorkerHeartbeat = typeof workerHeartbeat.$inferSelect;
export type NewWorkerHeartbeat = typeof workerHeartbeat.$inferInsert;
export type Settings = typeof settings.$inferSelect;
export type NewSettings = typeof settings.$inferInsert;
