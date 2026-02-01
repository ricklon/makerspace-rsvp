CREATE TABLE `event_series` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`time_start` text NOT NULL,
	`time_end` text,
	`location` text NOT NULL,
	`capacity` integer,
	`requires_waiver` integer DEFAULT false NOT NULL,
	`waiver_text` text,
	`discord_link` text,
	`recurrence_rule` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`max_occurrences` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `series_status_idx` ON `event_series` (`status`);--> statement-breakpoint
CREATE INDEX `series_start_date_idx` ON `event_series` (`start_date`);--> statement-breakpoint
ALTER TABLE `events` ADD `series_id` text REFERENCES event_series(id);--> statement-breakpoint
ALTER TABLE `events` ADD `series_instance_date` text;--> statement-breakpoint
ALTER TABLE `events` ADD `is_series_exception` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `series_id_idx` ON `events` (`series_id`);