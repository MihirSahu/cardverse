CREATE TABLE `card_snapshots` (
	`slug` text PRIMARY KEY NOT NULL,
	`display_rank` integer NOT NULL,
	`payload` text NOT NULL,
	`source_payload` text NOT NULL,
	`source_updated_at` text,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `refresh_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`request_count` integer DEFAULT 0 NOT NULL,
	`card_count` integer DEFAULT 0 NOT NULL,
	`error` text
);
