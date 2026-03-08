/**
 * GET /api/reminders
 *
 * Returns all active (unfired) reminders.
 */
import { listActiveReminders } from '../../utils/reminders';

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  return listActiveReminders();
});
