/**
 * GET /api/schedules
 *
 * Returns all registered schedules.
 * Optional query param: ?moduleId=xxx to filter by module.
 */
import { useBrainScheduler } from '../../core/scheduler';

export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const query = getQuery(event);
  const moduleId = query.moduleId as string | undefined;

  const scheduler = useBrainScheduler();
  await scheduler.ready();

  const rows = await scheduler.list(moduleId);

  return rows.map((row) => ({
    ...row,
    payload: row.payload ? JSON.parse(row.payload) : null,
  }));
});
