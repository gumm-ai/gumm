/**
 * DELETE /api/reminders/:id
 *
 * Cancel and delete a pending reminder.
 */
import { cancelReminder } from '../../../utils/reminders';

export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing reminder ID',
    });
  }

  await cancelReminder(id);
  return { ok: true };
});
