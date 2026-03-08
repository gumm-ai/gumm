-- Migration: 0008 - Agent tasks table
-- CLI ↔ Telegram bridge: tasks delegated to CLI agent for local execution

CREATE TABLE IF NOT EXISTS `agent_tasks` (
  `id` text PRIMARY KEY NOT NULL,
  `status` text NOT NULL DEFAULT 'pending',
  `prompt` text NOT NULL,
  `result` text,
  `channel` text NOT NULL DEFAULT 'telegram',
  `chat_id` integer,
  `conversation_id` text,
  `claimed_at` integer,
  `completed_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
