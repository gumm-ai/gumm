/**
 * GET /api/connections/:id
 *
 * Returns a single API connection by ID. Config secrets are masked.
 */
import { eq } from 'drizzle-orm';
import { apiConnections } from '../../../db/schema';
import { decryptConfig } from '../../../utils/connection-crypto';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, message: 'Connection ID required' });
  }

  const [row] = await useDrizzle()
    .select()
    .from(apiConnections)
    .where(eq(apiConnections.id, id));

  if (!row) {
    throw createError({ statusCode: 404, message: 'Connection not found' });
  }

  const config = decryptConfig(row.config);

  const masked: Record<string, string> = {};
  for (const [k, v] of Object.entries(config)) {
    if (typeof v === 'string' && v.length > 4) {
      masked[k] = v.slice(0, 4) + '•'.repeat(Math.min(v.length - 4, 20));
    } else {
      masked[k] = v;
    }
  }

  return {
    ...row,
    config: masked,
    createdAt: row.createdAt?.getTime?.() ?? row.createdAt,
    updatedAt: row.updatedAt?.getTime?.() ?? row.updatedAt,
    lastTestedAt: row.lastTestedAt?.getTime?.() ?? row.lastTestedAt,
  };
});
