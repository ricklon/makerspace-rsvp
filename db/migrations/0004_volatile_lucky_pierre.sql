CREATE TABLE `admin_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`clerk_user_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`reason` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_requests_clerk_user_id_unique` ON `admin_requests` (`clerk_user_id`);--> statement-breakpoint
CREATE INDEX `admin_request_clerk_user_id_idx` ON `admin_requests` (`clerk_user_id`);--> statement-breakpoint
CREATE INDEX `admin_request_status_idx` ON `admin_requests` (`status`);