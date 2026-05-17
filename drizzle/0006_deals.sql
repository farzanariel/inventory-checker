-- SPEC §22: Buying-Group Deals Integration.
-- 1. items: add `upc` column (nullable). Backfill is a separate one-shot
--    script (scripts/backfill-upc.ts) — migration only adds the column.
-- 2. deal_groups: directory of buying-group sources.
-- 3. item_deals: current snapshot, wiped & repopulated each sync.
-- 4. deal_price_history: append-on-change log; 90-day retention pruned
--    in the worker hourly sweep.
-- 5. deals_sync: singleton meta row for short-circuiting identical pulls.

ALTER TABLE `items` ADD COLUMN `upc` text;
--> statement-breakpoint
CREATE INDEX `idx_items_upc` ON `items` (`upc`) WHERE `upc` IS NOT NULL;
--> statement-breakpoint
CREATE TABLE `deal_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`display_name` text NOT NULL,
	`homepage_url` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_deal_groups_source` ON `deal_groups` (`source`);
--> statement-breakpoint
CREATE TABLE `item_deals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`group_id` integer NOT NULL,
	`group_price_cents` integer NOT NULL,
	`retail_price_cents` integer,
	`is_available` integer NOT NULL,
	`deal_url` text NOT NULL,
	`deal_title` text,
	`match_kind` text NOT NULL,
	`fetched_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `deal_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_item_deals_item_group` ON `item_deals` (`item_id`,`group_id`);
--> statement-breakpoint
CREATE INDEX `idx_item_deals_item` ON `item_deals` (`item_id`);
--> statement-breakpoint
CREATE TABLE `deal_price_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`group_id` integer NOT NULL,
	`group_price_cents` integer NOT NULL,
	`is_available` integer NOT NULL,
	`ts` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `deal_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_deal_history_item_group_ts` ON `deal_price_history` (`item_id`,`group_id`,`ts`);
--> statement-breakpoint
CREATE TABLE `deals_sync` (
	`id` integer PRIMARY KEY NOT NULL,
	`last_upstream_updated` integer,
	`last_sync_at` integer,
	`last_sync_ok` integer,
	`last_error` text,
	`deal_count` integer,
	`matched_item_count` integer,
	CONSTRAINT `deals_sync_singleton` CHECK (`id` = 1)
);
