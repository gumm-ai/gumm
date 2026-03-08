/**
 * DELETE /api/network/wireguard/peer/:id
 *
 * Remove a WireGuard peer by device ID. Clears VPN fields from the device.
 */
import { devices } from '../../../db/schema';
import { eq } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, message: 'Device ID required' });
  }

  const db = useDrizzle();
  const device = await db
    .select()
    .from(devices)
    .where(eq(devices.id, id))
    .get();

  if (!device) {
    throw createError({ statusCode: 404, message: 'Device not found' });
  }

  if (device.vpnType !== 'wireguard') {
    throw createError({
      statusCode: 400,
      message: 'Device is not a WireGuard peer',
    });
  }

  await db
    .update(devices)
    .set({
      vpnIp: null,
      vpnType: null,
      vpnPubkey: null,
      internalPort: null,
      updatedAt: new Date(),
    })
    .where(eq(devices.id, id));

  return { ok: true, removed: device.name, freedIp: device.vpnIp };
});
