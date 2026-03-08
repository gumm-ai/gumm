/**
 * POST /api/network/netbird/connect
 *
 * Enable NetBird VPN mode and store configuration.
 * Body: { hostname?: string, ip?: string }
 *
 * NOTE: NetBird daemon should run on the HOST, not in Docker.
 * This endpoint only configures Gumm to expect traffic via VPN.
 * The vpn-guard middleware will allow Docker internal network traffic.
 */

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const body = await readBody<{ hostname?: string; ip?: string }>(event);

  const hostname = body?.hostname || 'gumm';
  const ip = body?.ip || '';

  const brain = useBrain();
  await brain.ready();

  // Set VPN mode to netbird
  await brain.setConfig('network.mode', 'netbird');
  await brain.setConfig('network.netbird.hostname', hostname);
  if (ip) {
    await brain.setConfig('network.netbird.ip', ip);
  }

  console.log(
    `[netbird] VPN mode enabled via API (hostname: ${hostname}, ip: ${ip || 'not set'})`,
  );

  return {
    ok: true,
    mode: 'netbird',
    hostname,
    ip: ip || null,
    message: 'NetBird mode enabled. Make sure NetBird is running on the host.',
  };
});
