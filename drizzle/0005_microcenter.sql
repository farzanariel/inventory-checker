-- SPEC §21: add MicroCenter as second retailer.
-- 1. items: add `retailer` (default 'bestbuy') and `mc_product_id`; relax
--    `sku` to NULLABLE (MC items have NULL sku). SQLite can't drop NOT NULL
--    in place, so we recreate the table.
-- 2. Replace global UNIQUE(sku) with per-retailer partial unique indexes.
-- 3. stock_events.store_number column for per-store MC events.
-- 4. New item_stores table for per-(item, store) state.

CREATE TABLE `__new_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`retailer` text DEFAULT 'bestbuy' NOT NULL,
	`sku` text,
	`mc_product_id` text,
	`name` text,
	`brand` text,
	`image_url` text,
	`product_url` text NOT NULL,
	`current_price_cents` integer,
	`regular_price_cents` integer,
	`check_interval_min` integer DEFAULT 1 NOT NULL,
	`restock_notify_interval_min` integer DEFAULT 10 NOT NULL,
	`stock_alert_enabled` integer DEFAULT 1 NOT NULL,
	`stock_notify_mode` text DEFAULT 'repeat' NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`note` text,
	`last_stock_status` text DEFAULT 'UNKNOWN' NOT NULL,
	`last_button_state` text,
	`health_status` text DEFAULT 'OK' NOT NULL,
	`last_health_message` text,
	`consecutive_errors` integer DEFAULT 0 NOT NULL,
	`last_checked_at` integer,
	`last_in_stock_at` integer,
	`last_notified_at` integer,
	`next_check_due_at` integer,
	`price_alert_enabled` integer DEFAULT 1 NOT NULL,
	`target_price_cents` integer,
	`price_notify_interval_min` integer DEFAULT 60 NOT NULL,
	`price_notify_mode` text DEFAULT 'repeat' NOT NULL,
	`last_price_notified_at` integer,
	`price_alert_while_oos` integer DEFAULT 1 NOT NULL,
	`pending_hit_price_cents` integer,
	`pending_hit_seen_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_items` (
	`id`, `retailer`, `sku`, `mc_product_id`, `name`, `brand`, `image_url`, `product_url`,
	`current_price_cents`, `regular_price_cents`, `check_interval_min`, `restock_notify_interval_min`,
	`stock_alert_enabled`, `stock_notify_mode`, `enabled`, `note`,
	`last_stock_status`, `last_button_state`, `health_status`, `last_health_message`, `consecutive_errors`,
	`last_checked_at`, `last_in_stock_at`, `last_notified_at`, `next_check_due_at`,
	`price_alert_enabled`, `target_price_cents`, `price_notify_interval_min`, `price_notify_mode`,
	`last_price_notified_at`, `price_alert_while_oos`,
	`pending_hit_price_cents`, `pending_hit_seen_count`,
	`created_at`, `updated_at`
)
SELECT
	`id`, 'bestbuy', `sku`, NULL, `name`, `brand`, `image_url`, `product_url`,
	`current_price_cents`, `regular_price_cents`, `check_interval_min`, `restock_notify_interval_min`,
	`stock_alert_enabled`, `stock_notify_mode`, `enabled`, `note`,
	`last_stock_status`, `last_button_state`, `health_status`, `last_health_message`, `consecutive_errors`,
	`last_checked_at`, `last_in_stock_at`, `last_notified_at`, `next_check_due_at`,
	`price_alert_enabled`, `target_price_cents`, `price_notify_interval_min`, `price_notify_mode`,
	`last_price_notified_at`, `price_alert_while_oos`,
	`pending_hit_price_cents`, `pending_hit_seen_count`,
	`created_at`, `updated_at`
FROM `items`;
--> statement-breakpoint
DROP TABLE `items`;
--> statement-breakpoint
ALTER TABLE `__new_items` RENAME TO `items`;
--> statement-breakpoint
CREATE INDEX `idx_items_due` ON `items` (`enabled`,`next_check_due_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_items_bb_sku` ON `items` (`sku`) WHERE `retailer` = 'bestbuy';
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_items_mc_pid` ON `items` (`mc_product_id`) WHERE `retailer` = 'microcenter';
--> statement-breakpoint
ALTER TABLE `stock_events` ADD COLUMN `store_number` text;
--> statement-breakpoint
CREATE TABLE `item_stores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`store_number` text NOT NULL,
	`store_name` text NOT NULL,
	`is_online` integer DEFAULT 0 NOT NULL,
	`alert_enabled` integer DEFAULT 1 NOT NULL,
	`last_qoh` integer,
	`last_stock_status` text DEFAULT 'UNKNOWN' NOT NULL,
	`last_in_stock_at` integer,
	`last_notified_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_item_stores_item_store` ON `item_stores` (`item_id`,`store_number`);
--> statement-breakpoint
CREATE INDEX `idx_item_stores_item` ON `item_stores` (`item_id`);
