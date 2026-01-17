-- Add confirmation_token column (nullable initially)
ALTER TABLE `rsvps` ADD `confirmation_token` text;--> statement-breakpoint

-- Add checkin_token column (nullable initially)
ALTER TABLE `rsvps` ADD `checkin_token` text;--> statement-breakpoint

-- Generate tokens for any existing rows
UPDATE `rsvps` SET
  `confirmation_token` = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
  `checkin_token` = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))
WHERE `confirmation_token` IS NULL OR `checkin_token` IS NULL;--> statement-breakpoint

CREATE UNIQUE INDEX `rsvps_confirmation_token_unique` ON `rsvps` (`confirmation_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `rsvps_checkin_token_unique` ON `rsvps` (`checkin_token`);--> statement-breakpoint
CREATE INDEX `rsvp_confirmation_token_idx` ON `rsvps` (`confirmation_token`);--> statement-breakpoint
CREATE INDEX `rsvp_checkin_token_idx` ON `rsvps` (`checkin_token`);
