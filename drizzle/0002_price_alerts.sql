ALTER TABLE items ADD COLUMN price_alert_enabled INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE items ADD COLUMN price_drop_threshold_pct INTEGER NOT NULL DEFAULT 5;
--> statement-breakpoint
ALTER TABLE items ADD COLUMN price_drop_threshold_cents INTEGER NOT NULL DEFAULT 1000;
--> statement-breakpoint
ALTER TABLE items ADD COLUMN price_notify_interval_min INTEGER NOT NULL DEFAULT 60;
--> statement-breakpoint
ALTER TABLE items ADD COLUMN last_price_notified_at INTEGER;
--> statement-breakpoint
ALTER TABLE items ADD COLUMN baseline_price_cents INTEGER;
--> statement-breakpoint
ALTER TABLE items ADD COLUMN baseline_set_at INTEGER;
--> statement-breakpoint
ALTER TABLE items ADD COLUMN price_alert_while_oos INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE items ADD COLUMN pending_lower_price_cents INTEGER;
--> statement-breakpoint
ALTER TABLE items ADD COLUMN pending_lower_seen_count INTEGER NOT NULL DEFAULT 0;
