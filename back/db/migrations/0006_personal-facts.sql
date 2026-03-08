-- Migration: 0006 - Personal Facts
-- Structured personal information about the owner (identity, preferences, tastes, dislikes, etc.)
-- Always injected into the Brain's context so it can personalize all interactions.

CREATE TABLE IF NOT EXISTS `personal_facts` (
  `id` text PRIMARY KEY NOT NULL,
  `category` text NOT NULL DEFAULT 'other',
  `key` text NOT NULL,
  `value` text NOT NULL,
  `source` text NOT NULL DEFAULT 'auto',
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
