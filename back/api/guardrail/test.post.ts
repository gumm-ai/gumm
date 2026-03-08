/**
 * POST /api/guardrail/test
 *
 * Test endpoint to preview what the guardrail would detect in a message.
 * Returns detected sensitive data types without blocking.
 */
import { detectSensitiveData } from '../../utils/secrets';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const body = await readBody<{
    message: string;
    pattern?: string;
  }>(event);

  if (!body?.message) {
    throw createError({
      statusCode: 400,
      message: 'message is required',
    });
  }

  const result = detectSensitiveData(body.message, body.pattern);

  return result;
});
