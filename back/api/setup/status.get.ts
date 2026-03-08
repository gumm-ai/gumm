/**
 * GET /api/setup/status
 *
 * Returns whether initial setup has been completed.
 * No auth required — called before login is possible.
 */
export default defineEventHandler(async () => {
  // Check env vars (from setup-server.sh)
  const hasEnvPassword = !!process.env.GUMM_ADMIN_PASSWORD?.trim();
  const hasTelegramEnv = !!process.env.TELEGRAM_BOT_TOKEN?.trim();
  const vpnProviderEnv = (process.env.VPN_PROVIDER || 'none').toLowerCase();

  try {
    const brain = useBrain();
    await brain.ready();
    const setupDone = await brain.getConfig('setup.completed');

    // Check if Telegram is already configured in brain
    const telegramToken = await brain.getConfig('telegram.botToken');
    const hasTelegramConfig = !!telegramToken;

    // Network mode: prefer env var, fallback to brain config
    let networkMode = vpnProviderEnv;
    if (networkMode === 'none') {
      networkMode = (await brain.getConfig('network.mode')) || 'public';
    }

    return {
      needsSetup: setupDone !== 'true',
      hasEnvPassword,
      hasTelegram: hasTelegramEnv || hasTelegramConfig,
      networkMode,
      vpnProvider: vpnProviderEnv !== 'none' ? vpnProviderEnv : null,
      vpnConfiguredViaEnv: vpnProviderEnv !== 'none',
      telegramConfiguredViaEnv: hasTelegramEnv,
    };
  } catch {
    // DB not ready yet — needs setup
    return {
      needsSetup: true,
      hasEnvPassword,
      hasTelegram: hasTelegramEnv,
      networkMode: vpnProviderEnv !== 'none' ? vpnProviderEnv : 'public',
      vpnProvider: vpnProviderEnv !== 'none' ? vpnProviderEnv : null,
      vpnConfiguredViaEnv: vpnProviderEnv !== 'none',
      telegramConfiguredViaEnv: hasTelegramEnv,
    };
  }
});
