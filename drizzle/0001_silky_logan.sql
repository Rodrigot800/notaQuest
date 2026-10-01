CREATE INDEX `idx_contests_user_id` ON `contests` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_disciplines_user_contest` ON `disciplines` (`user_id`,`contest_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_user_discipline_date` ON `study_sessions` (`user_id`,`discipline_id`,`session_date`);--> statement-breakpoint
CREATE INDEX `idx_topics_user_discipline` ON `topics` (`user_id`,`discipline_id`);