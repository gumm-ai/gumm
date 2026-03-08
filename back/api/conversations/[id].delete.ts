/**
 * DELETE /api/conversations/:id
 *
 * Deletes a conversation and all its messages (cascade).
 * Invalidates Redis cache after deletion.
 */
import { eq } from 'drizzle-orm';
import { conversations } from '../../db/schema';
import { invalidateConversationCache } from '../../utils/conversation-cache';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, message: 'Conversation ID required' });
  }

  await useDrizzle().delete(conversations).where(eq(conversations.id, id));

  // Invalidate cache
  await invalidateConversationCache(id);

  return { ok: true };
});
