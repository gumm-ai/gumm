/**
 * BrainScheduler — Persistent cron scheduler for module scheduled tasks.
 *
 * - Reads schedule definitions from module manifests
 * - Persists them in SQLite (`schedules` table)
 * - Runs cron jobs in-process via `croner`
 * - Fires through EventBus for observability
 * - Hot-reloads when modules are added/removed
 */
import { Cron } from 'croner';
import { eq, and } from 'drizzle-orm';
import { schedules } from '../db/schema';
import type { ScheduleDefinition } from '../utils/module-types';

export interface ScheduleEntry {
  id: string;
  moduleId: string;
  name: string;
  cron: string;
  handler: string;
  payload?: Record<string, any>;
  enabled: boolean;
}

class BrainScheduler {
  /** Active cron jobs keyed by schedule ID */
  private jobs = new Map<string, Cron>();
  private _initPromise: Promise<void> | null = null;

  // ── Lifecycle ─────────────────────────────────────────────────────────

  async init() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._doInit();
    return this._initPromise;
  }

  private async _doInit() {
    console.log('[BrainScheduler] Initializing...');
    await this.restoreFromDB();
    console.log(`[BrainScheduler] Ready — ${this.jobs.size} active job(s)`);
  }

  async ready() {
    if (this._initPromise) await this._initPromise;
  }

  // ── Restore persisted schedules on boot ───────────────────────────────

  private async restoreFromDB() {
    try {
      const rows = await useDrizzle().select().from(schedules);

      for (const row of rows) {
        if (!row.enabled) continue;

        await this.startCronJob({
          id: row.id,
          moduleId: row.moduleId,
          name: row.name,
          cron: row.cron,
          handler: row.handler,
          payload: row.payload ? JSON.parse(row.payload) : undefined,
          enabled: true,
        });
      }
    } catch (err: any) {
      console.warn(
        '[BrainScheduler] Could not restore schedules:',
        err.message,
      );
    }
  }

  // ── Sync schedules from a module manifest ─────────────────────────────

  /**
   * Called when a module is loaded/reloaded.
   * Upserts schedule definitions from the manifest into SQLite and starts crons.
   */
  async syncModuleSchedules(
    moduleId: string,
    scheduleDefs: ScheduleDefinition[],
  ) {
    const now = new Date();

    // Get existing schedules for this module
    const existing = await useDrizzle()
      .select()
      .from(schedules)
      .where(eq(schedules.moduleId, moduleId));

    const existingByName = new Map(existing.map((s) => [s.name, s]));
    const defsByName = new Map(scheduleDefs.map((d) => [d.name, d]));

    // Remove schedules that are no longer in the manifest
    for (const [name, row] of existingByName) {
      if (!defsByName.has(name)) {
        this.stopCronJob(row.id);
        await useDrizzle().delete(schedules).where(eq(schedules.id, row.id));
        console.log(`[BrainScheduler] Removed schedule: ${moduleId}/${name}`);
      }
    }

    // Upsert current definitions
    for (const def of scheduleDefs) {
      const existingRow = existingByName.get(def.name);

      if (existingRow) {
        // Update if cron or handler changed
        if (
          existingRow.cron !== def.cron ||
          existingRow.handler !== def.handler
        ) {
          this.stopCronJob(existingRow.id);

          await useDrizzle()
            .update(schedules)
            .set({
              cron: def.cron,
              handler: def.handler,
              payload: def.payload ? JSON.stringify(def.payload) : null,
              updatedAt: now,
            })
            .where(eq(schedules.id, existingRow.id));

          if (existingRow.enabled) {
            await this.startCronJob({
              id: existingRow.id,
              moduleId,
              name: def.name,
              cron: def.cron,
              handler: def.handler,
              payload: def.payload,
              enabled: true,
            });
          }

          console.log(
            `[BrainScheduler] Updated schedule: ${moduleId}/${def.name}`,
          );
        }
      } else {
        // Insert new schedule
        const id = crypto.randomUUID();

        await useDrizzle()
          .insert(schedules)
          .values({
            id,
            moduleId,
            name: def.name,
            cron: def.cron,
            handler: def.handler,
            payload: def.payload ? JSON.stringify(def.payload) : null,
            enabled: true,
            runCount: 0,
            createdAt: now,
            updatedAt: now,
          });

        await this.startCronJob({
          id,
          moduleId,
          name: def.name,
          cron: def.cron,
          handler: def.handler,
          payload: def.payload,
          enabled: true,
        });

        console.log(
          `[BrainScheduler] Created schedule: ${moduleId}/${def.name} [${def.cron}]`,
        );
      }
    }
  }

  /**
   * Remove all schedules for a module (called on module unload/delete).
   */
  async removeModuleSchedules(moduleId: string) {
    const rows = await useDrizzle()
      .select()
      .from(schedules)
      .where(eq(schedules.moduleId, moduleId));

    for (const row of rows) {
      this.stopCronJob(row.id);
    }

    await useDrizzle()
      .delete(schedules)
      .where(eq(schedules.moduleId, moduleId));

    console.log(
      `[BrainScheduler] Removed all schedules for module: ${moduleId}`,
    );
  }

  // ── Toggle / Manual run ───────────────────────────────────────────────

  /**
   * Enable or disable a specific schedule.
   */
  async toggleSchedule(scheduleId: string, enabled: boolean) {
    const [row] = await useDrizzle()
      .select()
      .from(schedules)
      .where(eq(schedules.id, scheduleId))
      .limit(1);

    if (!row) throw new Error(`Schedule "${scheduleId}" not found`);

    await useDrizzle()
      .update(schedules)
      .set({ enabled: enabled, updatedAt: new Date() })
      .where(eq(schedules.id, scheduleId));

    if (enabled) {
      await this.startCronJob({
        id: row.id,
        moduleId: row.moduleId,
        name: row.name,
        cron: row.cron,
        handler: row.handler,
        payload: row.payload ? JSON.parse(row.payload) : undefined,
        enabled: true,
      });
    } else {
      this.stopCronJob(scheduleId);
    }

    console.log(
      `[BrainScheduler] Schedule ${row.name}: ${enabled ? 'enabled' : 'disabled'}`,
    );
  }

  /**
   * Trigger a schedule run immediately (outside of cron).
   */
  async triggerNow(scheduleId: string) {
    const [row] = await useDrizzle()
      .select()
      .from(schedules)
      .where(eq(schedules.id, scheduleId))
      .limit(1);

    if (!row) throw new Error(`Schedule "${scheduleId}" not found`);

    await this.executeSchedule({
      id: row.id,
      moduleId: row.moduleId,
      name: row.name,
      cron: row.cron,
      handler: row.handler,
      payload: row.payload ? JSON.parse(row.payload) : undefined,
      enabled: true,
    });
  }

  // ── Cron job management ───────────────────────────────────────────────

  private async startCronJob(entry: ScheduleEntry) {
    this.stopCronJob(entry.id);

    try {
      const brain = useBrain();
      const timezone = (await brain.getConfig('brain.timezone')) || 'UTC';

      const job = new Cron(entry.cron, { timezone }, async () => {
        await this.executeSchedule(entry);
      });

      this.jobs.set(entry.id, job);

      const nextRun = job.nextRun();
      const serverNow = new Date();
      console.log(
        `[BrainScheduler] Started ${entry.moduleId}/${entry.name} [${entry.cron}] timezone=${timezone}`,
      );
      console.log(
        `[BrainScheduler] Server time: ${serverNow.toISOString()} (${serverNow.getTimezoneOffset()}min offset)`,
      );
      console.log(
        `[BrainScheduler] Next run: ${nextRun?.toISOString()} (raw) -> ${nextRun?.toLocaleString('en-CA', { timeZone: timezone })} (${timezone})`,
      );

      if (nextRun) {
        useDrizzle()
          .update(schedules)
          .set({ nextRunAt: nextRun })
          .where(eq(schedules.id, entry.id))
          .catch(() => {});
      }
    } catch (err: any) {
      console.error(
        `[BrainScheduler] Invalid cron "${entry.cron}" for ${entry.moduleId}/${entry.name}:`,
        err.message,
      );
    }
  }

  private stopCronJob(scheduleId: string) {
    const job = this.jobs.get(scheduleId);
    if (job) {
      job.stop();
      this.jobs.delete(scheduleId);
    }
  }

  // ── Execution ─────────────────────────────────────────────────────────

  private async executeSchedule(entry: ScheduleEntry) {
    const now = new Date();
    let error: string | null = null;

    try {
      // Get the module from registry
      const registry = useModuleRegistry();
      const mod = registry
        .getAll()
        .find((m) => m.manifest.id === entry.moduleId);

      if (!mod || mod.status !== 'loaded') {
        throw new Error(
          `Module "${entry.moduleId}" not loaded — skipping schedule`,
        );
      }

      // Build module context
      const brain = useBrain();
      const ctx = brain.buildModuleContext(entry.moduleId);

      // Call the handler
      const result = await mod.handler(entry.handler, entry.payload || {}, ctx);

      // Emit success event through EventBus
      await brain.events.emit(entry.moduleId, 'schedule.executed', {
        scheduleId: entry.id,
        name: entry.name,
        handler: entry.handler,
        result,
        duration: Date.now() - now.getTime(),
      });

      console.log(
        `[BrainScheduler] ✓ Executed: ${entry.moduleId}/${entry.name}`,
      );
    } catch (err: any) {
      error = err.message;
      console.error(
        `[BrainScheduler] ✗ Failed: ${entry.moduleId}/${entry.name}:`,
        err.message,
      );

      // Emit error event
      try {
        const brain = useBrain();
        await brain.events.emit(entry.moduleId, 'schedule.error', {
          scheduleId: entry.id,
          name: entry.name,
          error: err.message,
        });
      } catch {
        // EventBus might not be ready
      }
    }

    // Update run metadata
    try {
      const job = this.jobs.get(entry.id);
      const nextRun = job?.nextRun() ?? null;

      const [current] = await useDrizzle()
        .select()
        .from(schedules)
        .where(eq(schedules.id, entry.id))
        .limit(1);

      await useDrizzle()
        .update(schedules)
        .set({
          lastRunAt: now,
          nextRunAt: nextRun,
          runCount: (current?.runCount ?? 0) + 1,
          lastError: error,
          updatedAt: now,
        })
        .where(eq(schedules.id, entry.id));
    } catch {
      // DB update failure is non-fatal
    }
  }

  // ── Delete / Update ────────────────────────────────────────────────────

  /**
   * Delete a schedule permanently.
   */
  async deleteSchedule(scheduleId: string) {
    this.stopCronJob(scheduleId);
    await useDrizzle().delete(schedules).where(eq(schedules.id, scheduleId));
    console.log(`[BrainScheduler] Deleted schedule: ${scheduleId}`);
  }

  /**
   * Update a schedule's cron expression and/or enabled state.
   */
  async updateSchedule(
    scheduleId: string,
    updates: { cron?: string; enabled?: boolean },
  ) {
    const [row] = await useDrizzle()
      .select()
      .from(schedules)
      .where(eq(schedules.id, scheduleId))
      .limit(1);

    if (!row) throw new Error(`Schedule "${scheduleId}" not found`);

    const newCron = updates.cron ?? row.cron;
    const newEnabled =
      updates.enabled !== undefined ? updates.enabled : row.enabled;

    // Stop existing job
    this.stopCronJob(scheduleId);

    await useDrizzle()
      .update(schedules)
      .set({
        cron: newCron,
        enabled: newEnabled,
        updatedAt: new Date(),
      })
      .where(eq(schedules.id, scheduleId));

    if (newEnabled) {
      await this.startCronJob({
        id: row.id,
        moduleId: row.moduleId,
        name: row.name,
        cron: newCron,
        handler: row.handler,
        payload: row.payload ? JSON.parse(row.payload) : undefined,
        enabled: true,
      });
    }

    console.log(
      `[BrainScheduler] Updated schedule ${row.name}: cron=${newCron}, enabled=${newEnabled}`,
    );
  }

  // ── Query ─────────────────────────────────────────────────────────────

  /**
   * List all schedules, optionally filtered by module.
   */
  async list(moduleId?: string) {
    if (moduleId) {
      return useDrizzle()
        .select()
        .from(schedules)
        .where(eq(schedules.moduleId, moduleId));
    }
    return useDrizzle().select().from(schedules);
  }

  /**
   * Get count of active cron jobs.
   */
  get activeJobCount(): number {
    return this.jobs.size;
  }

  // ── Timezone Reload ────────────────────────────────────────────────────

  /**
   * Reload all active cron jobs with the current timezone.
   * Called when the user changes their timezone setting.
   */
  async reloadAllJobs() {
    const rows = await useDrizzle()
      .select()
      .from(schedules)
      .where(eq(schedules.enabled, true));

    // Stop all existing jobs
    for (const [id, job] of this.jobs) {
      job.stop();
    }
    this.jobs.clear();

    // Restart with current timezone
    for (const row of rows) {
      await this.startCronJob({
        id: row.id,
        moduleId: row.moduleId,
        name: row.name,
        cron: row.cron,
        handler: row.handler,
        payload: row.payload ? JSON.parse(row.payload) : undefined,
        enabled: true,
      });
    }

    console.log(
      `[BrainScheduler] Reloaded ${rows.length} job(s) with updated timezone`,
    );
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  destroy() {
    for (const [id, job] of this.jobs) {
      job.stop();
    }
    this.jobs.clear();
    console.log('[BrainScheduler] Destroyed — all jobs stopped');
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let _scheduler: BrainScheduler | null = null;

export function useBrainScheduler(): BrainScheduler {
  if (!_scheduler) {
    _scheduler = new BrainScheduler();
    _scheduler
      .init()
      .catch((err) => console.error('[BrainScheduler] Init failed:', err));
  }
  return _scheduler;
}
