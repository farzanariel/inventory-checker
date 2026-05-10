CREATE TABLE `items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sku` text NOT NULL,
	`name` text,
	`brand` text,
	`image_url` text,
	`product_url` text NOT NULL,
	`current_price_cents` integer,
	`regular_price_cents` integer,
	`check_interval_min` integer DEFAULT 1 NOT NULL,
	`restock_notify_interval_min` integer DEFAULT 10 NOT NULL,
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
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_sku_unique` ON `items` (`sku`);--> statement-breakpoint
CREATE INDEX `idx_items_due` ON `items` (`enabled`,`next_check_due_at`);--> statement-breakpoint
CREATE TABLE `stock_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`status` text NOT NULL,
	`button_state` text,
	`price_cents` integer,
	`message` text,
	`ts` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_events_item_ts` ON `stock_events` (`item_id`,"ts" DESC);--> statement-breakpoint
CREATE TABLE `worker_heartbeat` (
	`id` integer PRIMARY KEY NOT NULL,
	`last_tick_at` integer NOT NULL,
	`items_checked_last` integer DEFAULT 0 NOT NULL,
	`errors_last` integer DEFAULT 0 NOT NULL,
	`worker_version` text,
	CONSTRAINT "worker_heartbeat_singleton" CHECK("worker_heartbeat"."id" = 1)
);
