CREATE TABLE `task_conversation_links` (
	`task_id` text NOT NULL,
	`device_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	PRIMARY KEY(`task_id`, `device_id`, `conversation_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text(200) NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL
);
