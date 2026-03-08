/**
 * PUT /api/schedules/:id
 *
 * Update a schedule's cron expression or enabled state.
 * Body: { cron?: string, enabled?: boolean }
 */
import { useBrainScheduler } from '../../../core/scheduler';

export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing schedule ID',
    });
  }

  const body = await readBody<{ cron?: string; enabled?: boolean }>(event);
  if (!body || (body.cron === undefined && body.enabled === undefined)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Body must contain at least { cron } or { enabled }',
    });
  }

  const scheduler = useBrainScheduler();
  await scheduler.ready();

  try {
    await scheduler.updateSchedule(id, body);
    return { ok: true };
  } catch (err: any) {
    throw createError({ statusCode: 404, statusMessage: err.message });
  }
});
