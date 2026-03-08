/**
 * POST /api/devices/heartbeat
 *
 * Called by CLI agents (gumm up / gumm storage serve) to register and
 * keep their device status alive. Uses upsert — creates on first call,
 * updates on subsequent calls.
 *
 * Body: { deviceId, name, type, os, arch, version, capabilities }
 */
import { devices } from '../../db/schema';
import { eq } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const body = await readBody<{
    deviceId: string;
    name: string;
    type: 'cli' | 'storage';
    os?: string;
    arch?: string;
    version?: string;
    capabilities?: string[];
    storageNodeId?: string;
    vpnIp?: string;
    vpnType?: 'tailscale' | 'wireguard';
    vpnPubkey?: string;
    internalPort?: number;
  }>(event);

  if (!body?.deviceId || !body?.name) {
    throw createError({
      statusCode: 400,
      message: 'deviceId and name are required',
    });
  }

  // Extract client IP
  const ip =
    getHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim() ||
    getHeader(event, 'x-real-ip') ||
    event.node.req.socket?.remoteAddress ||
    null;

  const db = useDrizzle();
  const now = new Date();

  const existing = await db
    .select()
    .from(devices)
    .where(eq(devices.id, body.deviceId))
    .get();

  if (existing) {
    await db
      .update(devices)
      .set({
        name: body.name,
        type: body.type || existing.type,
        os: body.os ?? existing.os,
        arch: body.arch ?? existing.arch,
        version: body.version ?? existing.version,
        status: 'online',
        ip,
        vpnIp: body.vpnIp ?? existing.vpnIp,
        vpnType: body.vpnType ?? existing.vpnType,
        vpnPubkey: body.vpnPubkey ?? existing.vpnPubkey,
        internalPort: body.internalPort ?? existing.internalPort,
        capabilities: JSON.stringify(body.capabilities || []),
        storageNodeId: body.storageNodeId ?? existing.storageNodeId,
        lastSeenAt: now,
        updatedAt: now,
      })
      .where(eq(devices.id, body.deviceId));
  } else {
    await db.insert(devices).values({
      id: body.deviceId,
      name: body.name,
      type: body.type || 'cli',
      os: body.os,
      arch: body.arch,
      version: body.version,
      status: 'online',
      ip,
      vpnIp: body.vpnIp || null,
      vpnType: body.vpnType || null,
      vpnPubkey: body.vpnPubkey || null,
      internalPort: body.internalPort || null,
      capabilities: JSON.stringify(body.capabilities || []),
      storageNodeId: body.storageNodeId,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  return { ok: true, deviceId: body.deviceId };
});
