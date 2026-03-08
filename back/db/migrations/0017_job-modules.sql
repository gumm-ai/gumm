-- Migration: 0017 - Add module_ids column to background_jobs
-- Allows jobs to use specific modules instead of all available ones

ALTER TABLE `background_jobs` ADD COLUMN `module_ids` text;
