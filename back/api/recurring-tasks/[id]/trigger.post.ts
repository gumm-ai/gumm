/**
 * POST /api/recurring-tasks/:id/trigger
 *
 * Manually trigger a recurring task execution (outside of its cron).
 */
import { triggerRecurringTask } from '../../../utils/recurring-tasks';

export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing recurring task ID',
    });
  }

  try {
    await triggerRecurringTask(id);
    return { ok: true, message: `Recurring task "${id}" triggered` };
  } catch (err: any) {
    throw createError({ statusCode: 404, statusMessage: err.message });
  }
});
