-- Migration: 0001 - Initial schema
-- Creates all core tables for Gumm Islands Architecture

-- Modules registry
CREATE TABLE IF NOT EXISTS `modules` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `version` text NOT NULL DEFAULT '1.0.0',
  `description` text DEFAULT '',
  `source` text NOT NULL DEFAULT 'local',
  `source_url` text,
  `entrypoint` text NOT NULL DEFAULT 'index.ts',
  `capabilities` text DEFAULT '[]',
  `schema` text,
  `status` text NOT NULL DEFAULT 'installed',
  `error` text,
  `installed_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
-- Conversations
CREATE TABLE IF NOT EXISTS `conversations` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
-- Messages
CREATE TABLE IF NOT EXISTS `messages` (
  `id` text PRIMARY KEY NOT NULL,
  `conversation_id` text NOT NULL REFERENCES `conversations`(`id`) ON DELETE CASCADE,
  `role` text NOT NULL,
  `content` text NOT NULL,
  `tool_call_id` text,
  `tool_calls` text,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
-- Memory (shared long-term memory)
CREATE TABLE IF NOT EXISTS `memory` (
  `id` text PRIMARY KEY NOT NULL,
  `namespace` text NOT NULL,
  `key` text NOT NULL,
  `value` text NOT NULL,
  `type` text NOT NULL DEFAULT 'fact',
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  UNIQUE(`namespace`, `key`)
);
--> statement-breakpoint
-- Events (inter-island journal)
CREATE TABLE IF NOT EXISTS `events` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `source` text NOT NULL,
  `type` text NOT NULL,
  `payload` text,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
-- Indexes
CREATE INDEX IF NOT EXISTS `idx_messages_conversation` ON `messages`(`conversation_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_memory_namespace` ON `memory`(`namespace`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_events_source` ON `events`(`source`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_events_type` ON `events`(`type`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_events_created` ON `events`(`created_at`);
