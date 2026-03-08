/**
 * Module Storage — Scoped key-value persistence for modules.
 *
 * Each module can store timestamped records under arbitrary keys,
 * namespaced by their module ID. Designed for time-series data
 * (e.g. daily credit snapshots) and cached state.
 */
import { eq, and, desc, gte, lte } from 'drizzle-orm';
import { moduleData } from '../db/schema';

export interface ModuleStorage {
  /** Store a value under a key (appends — does not overwrite). */
  store(key: string, value: unknown): Promise<void>;
  /** Get the latest stored value for a key. */
  get(key: string): Promise<unknown | null>;
  /** List stored values for a key, optionally filtered by time range. Most recent first. */
  list(
    key: string,
    opts?: { since?: Date; until?: Date; limit?: number },
  ): Promise<Array<{ value: unknown; createdAt: Date }>>;
  /** Remove all stored values for a key. */
  remove(key: string): Promise<number>;
}

/**
 * Build a namespaced storage object for a specific module.
 */
export function buildModuleStorage(moduleId: string): ModuleStorage {
  return {
    async store(key: string, value: unknown) {
      await useDrizzle()
        .insert(moduleData)
        .values({
          id: crypto.randomUUID(),
          moduleId,
          key,
          value: JSON.stringify(value),
          createdAt: new Date(),
        });
    },

    async get(key: string) {
      const [row] = await useDrizzle()
        .select()
        .from(moduleData)
        .where(and(eq(moduleData.moduleId, moduleId), eq(moduleData.key, key)))
        .orderBy(desc(moduleData.createdAt))
        .limit(1);

      if (!row) return null;
      try {
        return JSON.parse(row.value);
      } catch {
        return row.value;
      }
    },

    async list(key, opts) {
      const conditions = [
        eq(moduleData.moduleId, moduleId),
        eq(moduleData.key, key),
      ];

      if (opts?.since) conditions.push(gte(moduleData.createdAt, opts.since));
      if (opts?.until) conditions.push(lte(moduleData.createdAt, opts.until));

      const rows = await useDrizzle()
        .select()
        .from(moduleData)
        .where(and(...conditions))
        .orderBy(desc(moduleData.createdAt))
        .limit(opts?.limit ?? 100);

      return rows.map((r) => ({
        value: (() => {
          try {
            return JSON.parse(r.value);
          } catch {
            return r.value;
          }
        })(),
        createdAt: r.createdAt,
      }));
    },

    async remove(key) {
      const result = await useDrizzle()
        .delete(moduleData)
        .where(and(eq(moduleData.moduleId, moduleId), eq(moduleData.key, key)));

      return result.rowsAffected ?? 0;
    },
  };
}

/**
 * Cleanup all stored data for a module (called on module uninstall).
 */
export async function removeModuleData(moduleId: string) {
  await useDrizzle()
    .delete(moduleData)
    .where(eq(moduleData.moduleId, moduleId));
}
