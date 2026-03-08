/**
 * GET /api/storage/nodes
 *
 * Returns all registered storage nodes.
 * Tokens are masked in the response.
 */
import { storageNodes } from '../../db/schema';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const rows = await useDrizzle().select().from(storageNodes);

  return {
    nodes: rows.map((row) => ({
      ...row,
      token:
        row.token.slice(0, 4) + '•'.repeat(Math.min(row.token.length - 4, 20)),
      createdAt: row.createdAt?.getTime?.() ?? row.createdAt,
      updatedAt: row.updatedAt?.getTime?.() ?? row.updatedAt,
      lastSeenAt: row.lastSeenAt?.getTime?.() ?? row.lastSeenAt,
    })),
  };
});
