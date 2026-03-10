/**
 * Nitro Plugin — Persistent Jobs Recovery.
 *
 * On server startup, detects persistent background jobs that are stuck in
 * 'running' state because the server crashed or restarted while their
 * in-memory re-dispatch timer was pending.
 *
 * For device-based jobs: re-dispatches a health-check task to the CLI agent.
 * For server-side jobs: re-runs the agentic loop from scratch.
 */
import { and, eq } from 'drizzle-orm';
import { backgroundJobs } from '../db/schema';
import { recoverPersistentDeviceJobs } from '../utils/agent-tasks';
import { runBackgroundJob } from '../utils/background-jobs';

export default defineNitroPlugin(async () => {
  // Wait a bit for the brain / DB to fully initialize before recovering jobs
  setTimeout(async () => {
    try {
      // ── 1. Recover device-dispatched persistent jobs ───────────────────
      // These were stuck because the setTimeout re-dispatch was lost on restart.
      await recoverPersistentDeviceJobs();

      // ── 2. Recover server-side persistent jobs ─────────────────────────
      // These ran their agentic loop on the server; restart the loop.
      const staleServerJobs = await useDrizzle()
        .select()
        .from(backgroundJobs)
        .where(
          and(
            eq(backgroundJobs.status, 'running'),
            eq(backgroundJobs.persistent, true),
          ),
        );

      // Filter to server-side only (no deviceIds)
      const serverJobs = staleServerJobs.filter((j) => !j.deviceIds);

      for (const job of serverJobs) {
        console.log(
          `[PersistentJobsRecovery] Restarting server-side persistent job "${job.title}" (${job.id})`,
        );
        runBackgroundJob(job.id);
      }
    } catch (err: any) {
      console.error(
        '[PersistentJobsRecovery] Failed to recover persistent jobs:',
        err.message,
      );
    }
  }, 5_000);
});
