/**
 * POST /api/network/setup
 *
 * Initialize or change the VPN networking mode.
 * Body: { mode: 'tailscale' | 'netbird' | 'wireguard' | 'none', config?: Record<string, string> }
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const body = await readBody<{
    mode: 'tailscale' | 'netbird' | 'wireguard' | 'none';
    config?: Record<string, string>;
  }>(event);

  if (
    !body?.mode ||
    !['tailscale', 'netbird', 'wireguard', 'none'].includes(body.mode)
  ) {
    throw createError({
      statusCode: 400,
      message: 'mode must be tailscale, netbird, wireguard, or none',
    });
  }

  const brain = useBrain();
  await brain.ready();

  await brain.setConfig('network.mode', body.mode);

  // Store mode-specific config keys
  if (body.config) {
    for (const [key, value] of Object.entries(body.config)) {
      // Only allow network.* keys to prevent config injection
      if (key.startsWith('network.')) {
        await brain.setConfig(key, value);
      }
    }
  }

  return { ok: true, mode: body.mode };
});
