/**
 * DELETE /api/connections/:id
 *
 * Delete an API connection.
 */
import { eq } from 'drizzle-orm';
import { apiConnections } from '../../../db/schema';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, message: 'Connection ID required' });
  }

  const [existing] = await useDrizzle()
    .select()
    .from(apiConnections)
    .where(eq(apiConnections.id, id));

  if (!existing) {
    throw createError({ statusCode: 404, message: 'Connection not found' });
  }

  await useDrizzle().delete(apiConnections).where(eq(apiConnections.id, id));

  return { ok: true, id };
});
