/**
 * GET /api/devices
 *
 * Returns all registered devices with their status.
 * Devices that haven't sent a heartbeat in 2 minutes are marked offline.
 */
import { devices } from '../../db/schema';

const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const rows = await useDrizzle().select().from(devices);
  const now = Date.now();

  return {
    devices: rows.map((row) => {
      // Mark stale devices as offline
      const lastSeen = row.lastSeenAt ? new Date(row.lastSeenAt).getTime() : 0;
      const isStale = now - lastSeen > OFFLINE_THRESHOLD_MS;
      const status = isStale ? 'offline' : row.status;

      let capabilities: string[] = [];
      try {
        capabilities = JSON.parse(row.capabilities || '[]');
      } catch {}

      return {
        ...row,
        status,
        capabilities,
        lastSeenAt: row.lastSeenAt?.getTime?.() ?? row.lastSeenAt,
        createdAt: row.createdAt?.getTime?.() ?? row.createdAt,
        updatedAt: row.updatedAt?.getTime?.() ?? row.updatedAt,
      };
    }),
  };
});
