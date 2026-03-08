-- Migration: 0012 - Connected devices registry
-- Tracks all CLI agents and storage nodes that connect to the brain.
-- Used to display device status in the dashboard.

CREATE TABLE IF NOT EXISTS `devices` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `type` text NOT NULL DEFAULT 'cli',
  `os` text,
  `arch` text,
  `version` text,
  `status` text NOT NULL DEFAULT 'offline',
  `ip` text,
  `capabilities` text DEFAULT '[]',
  `storage_node_id` text,
  `last_seen_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
