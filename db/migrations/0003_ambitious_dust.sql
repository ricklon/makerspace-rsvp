PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_rsvps` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`attendee_id` text NOT NULL,
	`status` text DEFAULT 'yes' NOT NULL,
	`notes` text,
	`confirmation_token` text,
	`checkin_token` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attendee_id`) REFERENCES `attendees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_rsvps`("id", "event_id", "attendee_id", "status", "notes", "confirmation_token", "checkin_token", "created_at", "updated_at") SELECT "id", "event_id", "attendee_id", "status", "notes", "confirmation_token", "checkin_token", "created_at", "updated_at" FROM `rsvps`;--> statement-breakpoint
DROP TABLE `rsvps`;--> statement-breakpoint
ALTER TABLE `__new_rsvps` RENAME TO `rsvps`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `rsvps_confirmation_token_unique` ON `rsvps` (`confirmation_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `rsvps_checkin_token_unique` ON `rsvps` (`checkin_token`);--> statement-breakpoint
CREATE INDEX `rsvp_event_idx` ON `rsvps` (`event_id`);--> statement-breakpoint
CREATE INDEX `rsvp_attendee_idx` ON `rsvps` (`attendee_id`);--> statement-breakpoint
CREATE INDEX `rsvp_confirmation_token_idx` ON `rsvps` (`confirmation_token`);--> statement-breakpoint
CREATE INDEX `rsvp_checkin_token_idx` ON `rsvps` (`checkin_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `unique_rsvp` ON `rsvps` (`event_id`,`attendee_id`);--> statement-breakpoint
ALTER TABLE `attendees` ADD `clerk_user_id` text;--> statement-breakpoint
CREATE INDEX `clerk_user_id_idx` ON `attendees` (`clerk_user_id`);