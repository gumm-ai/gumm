-- Add persistent mode to background jobs.
-- Persistent jobs keep running (re-dispatching to CLI agents or re-running
-- the server-side agentic loop) until explicitly cancelled by the user.

ALTER TABLE background_jobs ADD COLUMN persistent INTEGER NOT NULL DEFAULT 0;
