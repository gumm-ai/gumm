/**
 * DELETE /api/jobs/:id
 *
 * Cancel and delete a background job.
 */
import {
  deleteBackgroundJob,
  getBackgroundJob,
} from '../../utils/background-jobs';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const id = getRouterParam(event, 'id');
  if (!id) throw createError({ statusCode: 400, message: 'id is required' });

  const job = await getBackgroundJob(id);
  if (!job) throw createError({ statusCode: 404, message: 'Job not found' });

  await deleteBackgroundJob(id);
  return { success: true };
});
