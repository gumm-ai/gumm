/**
 * GET /api/webhooks/history
 *
 * Returns recent webhook calls (last 100).
 * Useful for debugging integrations.
 */
import { recall } from '../../utils/memory';

const WEBHOOK_NAMESPACE = '_webhooks';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const webhookHistoryRaw = await recall(WEBHOOK_NAMESPACE, 'history');
  const history: any[] = webhookHistoryRaw
    ? JSON.parse(webhookHistoryRaw as string)
    : [];

  // Get limit from query (default 20)
  const limit = Math.min(Number(getQuery(event).limit) || 20, 100);

  return {
    webhooks: history.slice(0, limit),
    total: history.length,
  };
});
