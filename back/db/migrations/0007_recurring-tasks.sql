-- Migration: 0007 - Recurring tasks table
-- Cron-based recurring tasks created by the LLM (e.g. daily weather briefing)

CREATE TABLE IF NOT EXISTS `recurring_tasks` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `prompt` text NOT NULL,
  `cron` text NOT NULL,
  `channel` text NOT NULL DEFAULT 'web',
  `chat_id` integer,
  `conversation_id` text,
  `enabled` integer NOT NULL DEFAULT 1,
  `last_run_at` integer,
  `next_run_at` integer,
  `run_count` integer NOT NULL DEFAULT 0,
  `last_error` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
