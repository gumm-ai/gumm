/**
 * PUT /api/recurring-tasks/:id/toggle
 *
 * Enable or disable a recurring task.
 * Body: { "enabled": true|false }
 */
import { toggleRecurringTask } from '../../../utils/recurring-tasks';

export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing recurring task ID',
    });
  }

  const body = await readBody<{ enabled: boolean }>(event);
  if (typeof body?.enabled !== 'boolean') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Body must contain { enabled: boolean }',
    });
  }

  try {
    await toggleRecurringTask(id, body.enabled);
    return { ok: true, enabled: body.enabled };
  } catch (err: any) {
    throw createError({ statusCode: 404, statusMessage: err.message });
  }
});
