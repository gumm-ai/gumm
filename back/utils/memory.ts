import { eq, and, like } from 'drizzle-orm';
import { memory } from '../db/schema';
import { indexMemory, deindexMemory, deindexNamespace } from './vector-memory';

/**
 * Store a value in long-term memory.
 * Upserts: if the (namespace, key) pair exists, it's updated.
 * Dual-writes to Redis vector index when available.
 */
export async function remember(
  namespace: string,
  key: string,
  value: unknown,
  type: 'fact' | 'preference' | 'context' | 'event' = 'fact',
) {
  const now = new Date();
  const jsonValue = JSON.stringify(value);

  // Try update first
  const updated = await useDrizzle()
    .update(memory)
    .set({ value: jsonValue, type, updatedAt: now })
    .where(and(eq(memory.namespace, namespace), eq(memory.key, key)))
    .returning();

  if (updated.length > 0) {
    // Dual-write: update Redis vector index (non-blocking)
    _indexInBackground(namespace, key, value, type);
    return updated[0];
  }

  // Insert if not found
  const id = crypto.randomUUID();
  const [inserted] = await useDrizzle()
    .insert(memory)
    .values({
      id,
      namespace,
      key,
      value: jsonValue,
      type,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  // Dual-write: index in Redis (non-blocking)
  _indexInBackground(namespace, key, value, type);

  return inserted;
}

/** Fire-and-forget Redis indexing — never blocks the SQLite write path. */
function _indexInBackground(
  namespace: string,
  key: string,
  value: unknown,
  type: string,
) {
  import('../core/brain')
    .then(({ useBrain }) => {
      const brain = useBrain();
      brain.getConfig('openrouter.apiKey').then((apiKey) => {
        if (apiKey)
          indexMemory(namespace, key, value, type, apiKey).catch(() => {});
      });
    })
    .catch(() => {});
}

/**
 * Recall a single memory entry by namespace + key.
 * Returns the parsed JSON value, or null if not found.
 */
export async function recall(
  namespace: string,
  key: string,
): Promise<unknown | null> {
  const [row] = await useDrizzle()
    .select()
    .from(memory)
    .where(and(eq(memory.namespace, namespace), eq(memory.key, key)))
    .limit(1);

  if (!row) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

/**
 * Recall all memory entries for a given namespace.
 */
export async function recallAll(namespace: string) {
  const rows = await useDrizzle()
    .select()
    .from(memory)
    .where(eq(memory.namespace, namespace));

  return rows.map((row) => ({
    ...row,
    value: (() => {
      try {
        return JSON.parse(row.value);
      } catch {
        return row.value;
      }
    })(),
  }));
}

/**
 * Remove a memory entry by namespace + key.
 */
export async function forget(namespace: string, key: string) {
  await useDrizzle()
    .delete(memory)
    .where(and(eq(memory.namespace, namespace), eq(memory.key, key)));

  // Remove from Redis vector index
  deindexMemory(namespace, key).catch(() => {});
}

/**
 * Remove all memory entries for a given namespace.
 */
export async function forgetAll(namespace: string) {
  await useDrizzle().delete(memory).where(eq(memory.namespace, namespace));

  // Remove namespace from Redis vector index
  deindexNamespace(namespace).catch(() => {});
}

/**
 * Search memory values across all namespaces.
 */
export async function searchMemory(query: string) {
  const rows = await useDrizzle()
    .select()
    .from(memory)
    .where(like(memory.value, `%${query}%`));

  return rows.map((row) => ({
    ...row,
    value: (() => {
      try {
        return JSON.parse(row.value);
      } catch {
        return row.value;
      }
    })(),
  }));
}

/**
 * Get all memory entries with optional filters.
 */
export async function getAllMemory(filters?: {
  namespace?: string;
  type?: string;
}) {
  const conditions = [];
  if (filters?.namespace) {
    conditions.push(eq(memory.namespace, filters.namespace));
  }
  if (filters?.type) {
    conditions.push(eq(memory.type, filters.type as any));
  }

  const query = useDrizzle().select().from(memory);

  if (conditions.length > 0) {
    return (query as any).where(and(...conditions));
  }
  return query;
}
