/**
 * GET /api/network/peers
 *
 * Returns all VPN-connected devices with their mesh IPs,
 * type, and online status.
 */
import { devices } from '../../db/schema';
import { isNotNull } from 'drizzle-orm';

const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000;

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const rows = await useDrizzle()
    .select()
    .from(devices)
    .where(isNotNull(devices.vpnIp));

  const now = Date.now();

  return {
    peers: rows.map((row) => {
      const lastSeen = row.lastSeenAt ? new Date(row.lastSeenAt).getTime() : 0;
      const isStale = now - lastSeen > OFFLINE_THRESHOLD_MS;

      let capabilities: string[] = [];
      try {
        capabilities = JSON.parse(row.capabilities || '[]');
      } catch {}

      return {
        id: row.id,
        name: row.name,
        type: row.type,
        os: row.os,
        arch: row.arch,
        version: row.version,
        vpnIp: row.vpnIp,
        vpnType: row.vpnType,
        vpnPubkey: row.vpnPubkey,
        internalPort: row.internalPort,
        status: isStale ? 'offline' : row.status,
        ip: row.ip,
        capabilities,
        lastSeenAt: row.lastSeenAt?.getTime?.() ?? row.lastSeenAt,
      };
    }),
  };
});
