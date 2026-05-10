CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`discord_webhook_url` text,
	`discord_username` text,
	`updated_at` integer NOT NULL,
	CONSTRAINT "settings_singleton" CHECK("settings"."id" = 1)
);
