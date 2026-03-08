-- Migration: 0005 - Reminders table
-- One-shot reminders scheduled by the LLM via builtin tools

CREATE TABLE IF NOT EXISTS `reminders` (
  `id` text PRIMARY KEY NOT NULL,
  `message` text NOT NULL,
  `trigger_at` integer NOT NULL,
  `channel` text NOT NULL DEFAULT 'web',
  `chat_id` integer,
  `conversation_id` text,
  `fired` integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL
);
