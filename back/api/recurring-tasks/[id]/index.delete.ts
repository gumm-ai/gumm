/**
 * DELETE /api/recurring-tasks/:id
 *
 * Delete a recurring task permanently.
 */
import { cancelRecurringTask } from '../../../utils/recurring-tasks';

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
    await cancelRecurringTask(id);
    return { ok: true };
  } catch (err: any) {
    throw createError({ statusCode: 404, statusMessage: err.message });
  }
});
