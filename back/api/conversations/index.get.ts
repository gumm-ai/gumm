/**
 * GET /api/conversations
 *
 * Returns the list of all conversations, most recent first.
 * Uses Redis cache for improved performance.
 */
import { getConversationList } from '../../utils/conversation-cache';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  return getConversationList();
});
