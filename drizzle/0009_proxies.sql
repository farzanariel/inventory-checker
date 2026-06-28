CREATE TABLE `proxies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`host` text NOT NULL,
	`port` integer NOT NULL,
	`username` text,
	`password` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_proxies_identity` ON `proxies` (`host`,`port`,`username`,`password`);
