/**
 * GET /api/connections
 *
 * Returns all API connections. Config secrets are masked.
 * Module-defined connections (id starts with "module-") include metadata fields.
 */
import { apiConnections } from '../../db/schema';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const rows = await useDrizzle().select().from(apiConnections);

  return rows.map((row) => {
    // Parse config but mask secret values (except metadata fields starting with _)
    let config: Record<string, any> = {};
    try {
      config = JSON.parse(row.config);
    } catch {}

    const masked: Record<string, any> = {};
    const isModuleConfig = row.id.startsWith('module-');

    for (const [k, v] of Object.entries(config)) {
      // Keep metadata fields (starting with _) unmasked
      if (k.startsWith('_')) {
        masked[k] = v;
        continue;
      }

      // Mask string values (secrets)
      if (typeof v === 'string' && v.length > 4) {
        masked[k] = v.slice(0, 4) + '•'.repeat(Math.min(v.length - 4, 20));
      } else {
        masked[k] = v;
      }
    }

    return {
      ...row,
      config: masked,
      isModuleConfig,
      createdAt: row.createdAt?.getTime?.() ?? row.createdAt,
      updatedAt: row.updatedAt?.getTime?.() ?? row.updatedAt,
      lastTestedAt: row.lastTestedAt?.getTime?.() ?? row.lastTestedAt,
    };
  });
});
