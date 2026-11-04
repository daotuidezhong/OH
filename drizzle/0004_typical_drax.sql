CREATE TABLE `timetable_usage` (
	`bucket` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_timetable_usage_expiry` ON `timetable_usage` (`expires_at`);