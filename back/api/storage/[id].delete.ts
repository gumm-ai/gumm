/**
 * DELETE /api/storage/nodes/:id
 *
 * Remove a storage node.
 */
import { storageNodes } from '../../db/schema';
import { eq } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, message: 'Node ID required' });
  }

  const db = useDrizzle();
  const existing = await db
    .select()
    .from(storageNodes)
    .where(eq(storageNodes.id, id))
    .get();
  if (!existing) {
    throw createError({ statusCode: 404, message: 'Storage node not found' });
  }

  await db.delete(storageNodes).where(eq(storageNodes.id, id));

  return { ok: true, removed: existing.name };
});
