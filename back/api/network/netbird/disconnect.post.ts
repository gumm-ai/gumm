/**
 * POST /api/network/netbird/disconnect
 *
 * Disable NetBird VPN mode.
 *
 * NOTE: This only changes the Gumm configuration.
 * NetBird daemon on the host should be managed separately.
 */

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const brain = useBrain();
  await brain.ready();

  // Clear stored config
  await brain.setConfig('network.netbird.hostname', '');
  await brain.setConfig('network.netbird.ip', '');
  await brain.setConfig('network.mode', 'none');

  console.log('[netbird] VPN mode disabled via API');

  return { ok: true, message: 'NetBird mode disabled.' };
});
