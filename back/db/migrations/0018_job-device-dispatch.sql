-- Add device targeting to agent_tasks and background_jobs
-- Allows background jobs to be dispatched to specific CLI devices (gumm up)

ALTER TABLE agent_tasks ADD COLUMN device_id TEXT;
--> statement-breakpoint
ALTER TABLE agent_tasks ADD COLUMN background_job_id TEXT;
--> statement-breakpoint
ALTER TABLE background_jobs ADD COLUMN device_ids TEXT;
