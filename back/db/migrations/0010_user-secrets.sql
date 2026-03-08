-- Migration: 0010 - User secrets (sensitive credentials vault)
-- Stores service credentials locally. Passwords are hashed+salted.
-- These values are NEVER sent to the LLM — they stay on the server.

CREATE TABLE IF NOT EXISTS `user_secrets` (
  `id` text PRIMARY KEY NOT NULL,
  `service` text NOT NULL,
  `key` text NOT NULL,
  `value` text NOT NULL,
  `is_password` integer NOT NULL DEFAULT 0,
  `salt` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `user_secrets_service_key_idx` ON `user_secrets` (`service`, `key`);
