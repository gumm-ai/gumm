/**
 * POST /api/schedules/:id/trigger
 *
 * Manually trigger a schedule execution (outside of its cron).
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

  const scheduler = useBrainScheduler();
  await scheduler.ready();

  try {
    await scheduler.triggerNow(id);
    return { ok: true, message: `Schedule "${id}" triggered` };
  } catch (err: any) {
    throw createError({ statusCode: 404, statusMessage: err.message });
  }
});
