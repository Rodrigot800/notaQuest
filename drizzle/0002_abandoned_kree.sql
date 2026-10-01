ALTER TABLE `study_sessions` ADD `topic_id` text REFERENCES topics(id);--> statement-breakpoint
CREATE INDEX `idx_sessions_user_topic_date` ON `study_sessions` (`user_id`,`topic_id`,`session_date`);