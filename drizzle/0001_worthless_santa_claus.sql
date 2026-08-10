CREATE TABLE `card_suppressions` (
	`slug` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`fetched_at` integer NOT NULL
);
