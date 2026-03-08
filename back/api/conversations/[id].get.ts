/**
 * GET /api/conversations/:id
 *
 * Returns a conversation with all its messages.
 * Uses Redis cache for improved performance.
 */
import {
  getConversation,
  getConversationMessages,
} from '../../utils/conversation-cache';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, message: 'Conversation ID required' });
  }

  const conversation = await getConversation(id);
  if (!conversation) {
    throw createError({ statusCode: 404, message: 'Conversation not found' });
  }

  const messages = await getConversationMessages(id);

  return {
    ...conversation,
    messages,
  };
});
