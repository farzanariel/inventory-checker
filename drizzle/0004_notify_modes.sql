-- Stock-alert toggle + notify-mode columns for both stock and price.
-- Mirrors price_alert_enabled. Defaults preserve current behavior (repeat).
ALTER TABLE items ADD COLUMN stock_alert_enabled INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE items ADD COLUMN stock_notify_mode TEXT NOT NULL DEFAULT 'repeat';
--> statement-breakpoint
ALTER TABLE items ADD COLUMN price_notify_mode TEXT NOT NULL DEFAULT 'repeat';
