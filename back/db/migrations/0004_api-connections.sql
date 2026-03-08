-- Migration: 0004 - API Connections
-- Centralized API registry for managing all external service connections

CREATE TABLE IF NOT EXISTS `api_connections` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `provider` text NOT NULL,
  `auth_type` text NOT NULL DEFAULT 'api_key',
  `config` text NOT NULL DEFAULT '{}',
  `status` text NOT NULL DEFAULT 'disconnected',
  `error` text,
  `last_tested_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
