-- Migration: 0003 - Schedules table
-- Adds schedules table for recurring tasks & reminders (Brain Scheduler)

CREATE TABLE IF NOT EXISTS `schedules` (
  `id` text PRIMARY KEY NOT NULL,
  `module_id` text NOT NULL,
  `name` text NOT NULL,
  `cron` text NOT NULL,
  `handler` text NOT NULL,
  `payload` text,
  `enabled` integer NOT NULL DEFAULT 1,
  `last_run_at` integer,
  `next_run_at` integer,
  `run_count` integer NOT NULL DEFAULT 0,
  `last_error` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
