/**
 * GET /api/recurring-tasks
 *
 * Returns all recurring tasks (cron-based LLM-scheduled actions).
 */
import { listRecurringTasks } from '../../utils/recurring-tasks';

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  return listRecurringTasks();
});
