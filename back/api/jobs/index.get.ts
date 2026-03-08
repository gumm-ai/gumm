/**
 * GET /api/jobs
 *
 * List background jobs, optionally filtered by status.
 */
import {
  listBackgroundJobs,
  type BackgroundJobStatus,
} from '../../utils/background-jobs';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const query = getQuery(event);
  const status =
    typeof query.status === 'string'
      ? (query.status as BackgroundJobStatus)
      : undefined;

  const jobs = await listBackgroundJobs(status);
  return { jobs };
});
