-- Migration: 0014 - Commands (slash commands for chat, Telegram, CLI)
-- Allows users and modules to define custom slash commands

CREATE TABLE IF NOT EXISTS `commands` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL UNIQUE,
  `short_description` text NOT NULL,
  `description` text NOT NULL,
  `module_id` text,
  `enabled` integer NOT NULL DEFAULT 1,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_commands_name` ON `commands` (`name`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_commands_module` ON `commands` (`module_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_commands_enabled` ON `commands` (`enabled`);
