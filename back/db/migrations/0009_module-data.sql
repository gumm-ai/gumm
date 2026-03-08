-- Migration: 0009 - Module data storage
-- Scoped key-value store for modules (credit snapshots, cached data, etc.)

CREATE TABLE IF NOT EXISTS `module_data` (
  `id` text PRIMARY KEY NOT NULL,
  `module_id` text NOT NULL,
  `key` text NOT NULL,
  `value` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_module_data_module_key` ON `module_data` (`module_id`, `key`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_module_data_created` ON `module_data` (`module_id`, `key`, `created_at`);
