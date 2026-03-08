/**
 * DELETE /api/schedules/:id
 *
 * Delete a schedule permanently.
 */
import { useBrainScheduler } from '../../../core/scheduler';
import { eq } from 'drizzle-orm';
import { schedules } from '../../../db/schema';

export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing schedule ID',
    });
  }

  const [row] = await useDrizzle()
    .select()
    .from(schedules)
    .where(eq(schedules.id, id))
    .limit(1);

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Schedule not found' });
  }

  const scheduler = useBrainScheduler();
  await scheduler.ready();

  // Stop cron job if running and delete from DB
  await scheduler.deleteSchedule(id);

  return { ok: true };
});
