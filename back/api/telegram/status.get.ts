/**
 * GET /api/telegram/status
 *
 * Returns the current Telegram bot status and configuration.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user)
    throw createError({ statusCode: 401, message: 'Unauthorized' });

  const brain = useBrain();
  await brain.ready();

  // Check environment variables first (set by setup-server.sh)
  const envBotToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const envChatId = process.env.TELEGRAM_CHAT_ID?.trim();
  const configuredViaEnv = !!envBotToken;

  // Use env vars if available, otherwise fallback to brain config
  const botToken = envBotToken || (await brain.getConfig('telegram.botToken'));
  const enabled = envBotToken
    ? true
    : (await brain.getConfig('telegram.enabled')) === 'true';
  const botUsername = await brain.getConfig('telegram.botUsername');
  const botName = await brain.getConfig('telegram.botName');
  const webhookUrl = await brain.getConfig('telegram.webhookUrl');
  const allowedChatIds =
    envChatId || (await brain.getConfig('telegram.allowedChatIds'));

  if (!botToken) {
    return {
      configured: false,
      configuredViaEnv: false,
      enabled: false,
    };
  }

  // Check webhook status from Telegram
  let webhookInfo = null;
  try {
    webhookInfo = await telegramGetWebhookInfo(botToken);
  } catch {
    // Token might be invalid
  }

  return {
    configured: true,
    configuredViaEnv,
    enabled,
    mode: webhookUrl ? 'webhook' : 'polling',
    bot: {
      username: botUsername,
      name: botName,
    },
    webhook: {
      url: webhookUrl,
      info: webhookInfo,
    },
    allowedChatIds: allowedChatIds || '',
  };
});
