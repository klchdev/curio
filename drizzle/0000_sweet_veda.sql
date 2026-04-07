CREATE TABLE `games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`steam_app_id` integer NOT NULL,
	`title` text NOT NULL,
	`header_image` text,
	`hltb_minutes` integer,
	`excluded` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `games_steam_app_id_unique` ON `games` (`steam_app_id`);--> statement-breakpoint
CREATE TABLE `slot_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slot_id` integer NOT NULL,
	`rating` integer NOT NULL,
	`note` text NOT NULL,
	`playtime_minutes` integer NOT NULL,
	`completed_at` integer NOT NULL,
	FOREIGN KEY (`slot_id`) REFERENCES `slots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `slot_skips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slot_id` integer NOT NULL,
	`reason_type` text NOT NULL,
	`reason_text` text NOT NULL,
	`skipped_at` integer NOT NULL,
	FOREIGN KEY (`slot_id`) REFERENCES `slots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `slots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`game_id` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`playtime_on_start` integer DEFAULT 0 NOT NULL,
	`started_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`game_id` integer NOT NULL,
	`playtime_minutes` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`steam_id` text NOT NULL,
	`username` text NOT NULL,
	`avatar_url` text,
	`last_library_sync` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_steam_id_unique` ON `users` (`steam_id`);