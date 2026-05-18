-- SPEC §24: manual reorder.
-- items.sort_order is NULL by default — list falls back to createdAt DESC.
-- Populated only for items the user has dragged. Lower values sort first.

ALTER TABLE `items` ADD COLUMN `sort_order` integer;
--> statement-breakpoint
CREATE INDEX `idx_items_sort_order` ON `items` (`sort_order`) WHERE `sort_order` IS NOT NULL;
