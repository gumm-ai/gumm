/**
 * POST /api/jobs
 *
 * Create and immediately start a new background job.
 */
import { spawnBackgroundJob } from '../../utils/background-jobs';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const body = await readBody<{
    title: string;
    prompt: string;
    moduleIds?: string[];
  }>(event);
  if (!body?.title?.trim() || !body?.prompt?.trim()) {
    throw createError({
      statusCode: 400,
      message: 'title and prompt are required',
    });
  }

  const id = await spawnBackgroundJob({
    title: body.title.trim(),
    prompt: body.prompt.trim(),
    moduleIds: Array.isArray(body.moduleIds) ? body.moduleIds : undefined,
  });

  return { id };
});
