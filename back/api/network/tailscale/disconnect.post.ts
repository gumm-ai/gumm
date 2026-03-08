/**
 * POST /api/network/tailscale/disconnect
 *
 * Disable Tailscale VPN mode.
 *
 * NOTE: This only changes the Gumm configuration.
 * Tailscale daemon on the host should be managed separately.
 */

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const brain = useBrain();
  await brain.ready();

  // Clear stored config
  await brain.setConfig('network.tailscale.hostname', '');
  await brain.setConfig('network.tailscale.ip', '');
  await brain.setConfig('network.mode', 'none');

  console.log('[tailscale] VPN mode disabled via API');

  return { ok: true, message: 'Tailscale mode disabled.' };
});
