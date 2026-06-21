CREATE TABLE `conversation_queued_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`client_request_id` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`failure_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_queue_request_idx` ON `conversation_queued_messages` (`device_id`,`conversation_id`,`client_request_id`);