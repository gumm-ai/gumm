/**
 * POST /api/network/tailscale/connect
 *
 * Enable Tailscale VPN mode and store configuration.
 * Body: { hostname?: string, ip?: string }
 *
 * NOTE: Tailscale daemon should run on the HOST, not in Docker.
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

  // Set VPN mode to tailscale
  await brain.setConfig('network.mode', 'tailscale');
  await brain.setConfig('network.tailscale.hostname', hostname);
  if (ip) {
    await brain.setConfig('network.tailscale.ip', ip);
  }

  console.log(
    `[tailscale] VPN mode enabled via API (hostname: ${hostname}, ip: ${ip || 'not set'})`,
  );

  return {
    ok: true,
    mode: 'tailscale',
    hostname,
    ip: ip || null,
    message:
      'Tailscale mode enabled. Make sure Tailscale is running on the host.',
  };
});
