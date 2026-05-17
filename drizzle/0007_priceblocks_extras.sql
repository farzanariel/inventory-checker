-- SPEC §23: capture extra priceBlocks fields that already come back on
-- every poll. All nullable — only populated for items whose checks go
-- through the priceBlocks parsers (most BB items). GraphQL-metadata and
-- fulfillment-only paths leave them NULL.

ALTER TABLE `items` ADD COLUMN `condition` text;
--> statement-breakpoint
ALTER TABLE `items` ADD COLUMN `seller` text;
--> statement-breakpoint
ALTER TABLE `items` ADD COLUMN `seller_id` text;
--> statement-breakpoint
ALTER TABLE `items` ADD COLUMN `sale_ends_at` integer;
