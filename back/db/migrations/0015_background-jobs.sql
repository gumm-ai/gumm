-- Migration: 0015 - Background jobs table
-- Multi-agent parallel task runner: LLM-spawned background jobs with their own agentic loop

CREATE TABLE IF NOT EXISTS `background_jobs` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `prompt` text NOT NULL,
  `status` text NOT NULL DEFAULT 'pending',
  `result` text,
  `error` text,
  `conversation_id` text NOT NULL,
  `parent_conversation_id` text,
  `model` text,
  `iterations` integer NOT NULL DEFAULT 0,
  `started_at` integer,
  `completed_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
