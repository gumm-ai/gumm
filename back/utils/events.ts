import { eq, desc, and, like } from 'drizzle-orm';
import { events } from '../db/schema';

export interface EventFilter {
  source?: string;
  type?: string;
  limit?: number;
}

/**
 * Emit an event to the inter-island journal.
 * All events are persisted in SQLite for auditability.
 */
export async function emitEvent(
  source: string,
  type: string,
  payload?: unknown,
) {
  const [inserted] = await useDrizzle()
    .insert(events)
    .values({
      source,
      type,
      payload: payload ? JSON.stringify(payload) : null,
      createdAt: new Date(),
    })
    .returning();

  console.log(`[EventBus] ${source} → ${type}`);
  return inserted;
}

/**
 * Query past events with optional filters.
 * Supports wildcard matching on type (e.g. "module.*").
 */
export async function getEvents(filter: EventFilter = {}) {
  const conditions = [];

  if (filter.source) {
    conditions.push(eq(events.source, filter.source));
  }

  if (filter.type) {
    if (filter.type.includes('*')) {
      // Convert wildcard to SQL LIKE pattern
      const pattern = filter.type.replace(/\*/g, '%');
      conditions.push(like(events.type, pattern));
    } else {
      conditions.push(eq(events.type, filter.type));
    }
  }

  const query = useDrizzle()
    .select()
    .from(events)
    .orderBy(desc(events.createdAt))
    .limit(filter.limit ?? 50);

  if (conditions.length > 0) {
    return query.where(and(...conditions));
  }

  return query;
}
