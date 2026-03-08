-- Migration: 0011 - Storage nodes (centralized file storage devices)
-- Registers devices that act as the "stomach" — centralized storage
-- for all files across the brain and all connected devices.

CREATE TABLE IF NOT EXISTS `storage_nodes` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `url` text NOT NULL,
  `token` text NOT NULL,
  `role` text NOT NULL DEFAULT 'primary',
  `status` text NOT NULL DEFAULT 'offline',
  `total_bytes` integer,
  `used_bytes` integer,
  `last_seen_at` integer,
  `error` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
