-- SPEC §19 v5: pivot to target-price model (NEC-10 follow-up).
-- The threshold/baseline/pending-lower columns from 0002 are unused going forward.
-- Replaced with a single user-settable target_price_cents + a renamed pending-hit guard.
ALTER TABLE items ADD COLUMN target_price_cents INTEGER;
--> statement-breakpoint
ALTER TABLE items ADD COLUMN pending_hit_price_cents INTEGER;
--> statement-breakpoint
ALTER TABLE items ADD COLUMN pending_hit_seen_count INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE items DROP COLUMN price_drop_threshold_pct;
--> statement-breakpoint
ALTER TABLE items DROP COLUMN price_drop_threshold_cents;
--> statement-breakpoint
ALTER TABLE items DROP COLUMN baseline_price_cents;
--> statement-breakpoint
ALTER TABLE items DROP COLUMN baseline_set_at;
--> statement-breakpoint
ALTER TABLE items DROP COLUMN pending_lower_price_cents;
--> statement-breakpoint
ALTER TABLE items DROP COLUMN pending_lower_seen_count;
