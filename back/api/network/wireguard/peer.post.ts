/**
 * POST /api/network/wireguard/peer
 *
 * Register a new WireGuard peer. The Brain assigns an IP from the configured
 * subnet and stores the peer's public key. Returns the full WireGuard client
 * config needed to join the mesh.
 *
 * Body: { deviceId: string, publicKey: string }
 */
import { devices, brainConfig } from '../../../db/schema';
import { eq } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const body = await readBody<{
    deviceId: string;
    publicKey: string;
  }>(event);

  if (!body?.deviceId || !body?.publicKey) {
    throw createError({
      statusCode: 400,
      message: 'deviceId and publicKey are required',
    });
  }

  const brain = useBrain();
  await brain.ready();

  const mode = await brain.getConfig('network.mode');
  if (mode !== 'wireguard') {
    throw createError({
      statusCode: 400,
      message:
        'WireGuard mode is not active. Run POST /api/network/setup first.',
    });
  }

  const db = useDrizzle();

  // Verify device exists
  const device = await db
    .select()
    .from(devices)
    .where(eq(devices.id, body.deviceId))
    .get();

  if (!device) {
    throw createError({ statusCode: 404, message: 'Device not found' });
  }

  // Get subnet config
  const subnet =
    (await brain.getConfig('network.wireguard.subnet')) || '10.10.0.0/24';
  const endpoint = await brain.getConfig('network.wireguard.endpoint');
  const serverPubkey = await brain.getConfig('network.wireguard.server_pubkey');

  if (!endpoint || !serverPubkey) {
    throw createError({
      statusCode: 400,
      message:
        'WireGuard server not fully configured. Set network.wireguard.endpoint and network.wireguard.server_pubkey.',
    });
  }

  // Assign next available IP from subnet
  const assignedIp = await assignNextIp(db, subnet);

  // Update device with VPN info
  await db
    .update(devices)
    .set({
      vpnIp: assignedIp,
      vpnType: 'wireguard',
      vpnPubkey: body.publicKey,
      updatedAt: new Date(),
    })
    .where(eq(devices.id, body.deviceId));

  // Parse subnet for client config
  const subnetBase = subnet.split('/')[0];
  const subnetMask = subnet.split('/')[1] || '24';

  return {
    ok: true,
    assignedIp,
    config: {
      address: `${assignedIp}/32`,
      endpoint,
      serverPublicKey: serverPubkey,
      allowedIps: `${subnetBase}/${subnetMask}`,
      persistentKeepalive: 25,
    },
  };
});

/**
 * Assign the next available IP in the subnet.
 * Scans existing VPN IPs and picks the next one.
 */
async function assignNextIp(db: any, subnet: string): Promise<string> {
  const baseIp = subnet.split('/')[0] || '10.10.0.0';
  const octets = baseIp.split('.').map(Number);

  // Get all currently assigned WireGuard IPs
  const allDevices = await db.select().from(devices);
  const usedIps = new Set(
    allDevices
      .filter((d: any) => d.vpnIp && d.vpnType === 'wireguard')
      .map((d: any) => d.vpnIp),
  );

  // Start from .2 (reserve .1 for the Brain/server)
  for (let i = 2; i < 254; i++) {
    const candidate = `${octets[0]}.${octets[1]}.${octets[2]}.${i}`;
    if (!usedIps.has(candidate)) {
      return candidate;
    }
  }

  throw createError({
    statusCode: 507,
    message: 'No available IP addresses in the subnet',
  });
}
