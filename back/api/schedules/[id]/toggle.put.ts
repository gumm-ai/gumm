/**
 * PUT /api/schedules/:id/toggle
 *
 * Enable or disable a schedule.
 * Body: { "enabled": true|false }
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

  const body = await readBody<{ enabled: boolean }>(event);
  if (typeof body?.enabled !== 'boolean') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Body must contain { enabled: boolean }',
    });
  }

  const scheduler = useBrainScheduler();
  await scheduler.ready();

  try {
    await scheduler.toggleSchedule(id, body.enabled);
    return { ok: true, enabled: body.enabled };
  } catch (err: any) {
    throw createError({ statusCode: 404, statusMessage: err.message });
  }
});
