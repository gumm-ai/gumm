/**
 * PUT /api/recurring-tasks/:id
 *
 * Update a recurring task's name, prompt, or cron expression.
 * Body: { name?: string, prompt?: string, cron?: string }
 */
import { updateRecurringTask } from '../../../utils/recurring-tasks';

export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing recurring task ID',
    });
  }

  const body = await readBody<{
    name?: string;
    prompt?: string;
    cron?: string;
  }>(event);

  if (
    !body ||
    (body.name === undefined &&
      body.prompt === undefined &&
      body.cron === undefined)
  ) {
    throw createError({
      statusCode: 400,
      statusMessage:
        'Body must contain at least { name }, { prompt }, or { cron }',
    });
  }

  try {
    await updateRecurringTask(id, body);
    return { ok: true };
  } catch (err: any) {
    throw createError({ statusCode: 404, statusMessage: err.message });
  }
});
