CREATE TABLE `attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`attendee_id` text NOT NULL,
	`checked_in_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`check_in_method` text DEFAULT 'manual' NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attendee_id`) REFERENCES `attendees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attendance_event_idx` ON `attendance` (`event_id`);--> statement-breakpoint
CREATE INDEX `attendance_attendee_idx` ON `attendance` (`attendee_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `unique_attendance` ON `attendance` (`event_id`,`attendee_id`);--> statement-breakpoint
CREATE TABLE `attendees` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendees_email_unique` ON `attendees` (`email`);--> statement-breakpoint
CREATE INDEX `email_idx` ON `attendees` (`email`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text NOT NULL,
	`date` text NOT NULL,
	`time_start` text NOT NULL,
	`time_end` text,
	`location` text NOT NULL,
	`capacity` integer,
	`requires_waiver` integer DEFAULT false NOT NULL,
	`waiver_text` text,
	`discord_link` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_slug_unique` ON `events` (`slug`);--> statement-breakpoint
CREATE INDEX `slug_idx` ON `events` (`slug`);--> statement-breakpoint
CREATE INDEX `date_idx` ON `events` (`date`);--> statement-breakpoint
CREATE INDEX `status_idx` ON `events` (`status`);--> statement-breakpoint
CREATE TABLE `rsvps` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`attendee_id` text NOT NULL,
	`status` text DEFAULT 'yes' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attendee_id`) REFERENCES `attendees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rsvp_event_idx` ON `rsvps` (`event_id`);--> statement-breakpoint
CREATE INDEX `rsvp_attendee_idx` ON `rsvps` (`attendee_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `unique_rsvp` ON `rsvps` (`event_id`,`attendee_id`);--> statement-breakpoint
CREATE TABLE `waivers` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`attendee_id` text NOT NULL,
	`waiver_text` text NOT NULL,
	`signed_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`ip_address` text NOT NULL,
	`consent` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attendee_id`) REFERENCES `attendees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `waiver_event_idx` ON `waivers` (`event_id`);--> statement-breakpoint
CREATE INDEX `waiver_attendee_idx` ON `waivers` (`attendee_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `unique_waiver` ON `waivers` (`event_id`,`attendee_id`);