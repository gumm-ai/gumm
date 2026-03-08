-- Migration: 0016 - Command Modules (many-to-many: commands ↔ modules)
-- Allows commands to be scoped to specific modules for tool filtering

CREATE TABLE IF NOT EXISTS `command_modules` (
  `command_id` text NOT NULL REFERENCES `commands`(`id`) ON DELETE CASCADE,
  `module_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_command_modules_command` ON `command_modules` (`command_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_command_modules_module` ON `command_modules` (`module_id`);
