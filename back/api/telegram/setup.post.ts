/**
 * POST /api/telegram/setup
 *
 * Configure the Telegram bot: save token, register webhook.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user)
    throw createError({ statusCode: 401, message: 'Unauthorized' });

  const body = await readBody<{
    botToken: string;
    allowedChatIds?: string;
    webhookUrl?: string;
  }>(event);

  if (!body?.botToken?.trim()) {
    throw createError({ statusCode: 400, message: 'botToken is required' });
  }

  const token = body.botToken.trim();
  const brain = useBrain();
  await brain.ready();

  // Validate token by calling getMe
  let botInfo;
  try {
    botInfo = await telegramGetMe(token);
  } catch (err: any) {
    throw createError({
      statusCode: 400,
      message: `Invalid bot token: ${err.message}`,
    });
  }

  // Save config
  await brain.setConfig('telegram.botToken', token);
  await brain.setConfig('telegram.botUsername', botInfo.username);
  await brain.setConfig('telegram.botName', botInfo.first_name);
  await brain.setConfig('telegram.enabled', 'true');

  if (body.allowedChatIds) {
    await brain.setConfig(
      'telegram.allowedChatIds',
      body.allowedChatIds.trim(),
    );
  }

  // Register webhook or enable polling
  const webhookUrl = body.webhookUrl?.trim() || '';
  if (webhookUrl) {
    const fullUrl = `${webhookUrl}/api/telegram/webhook`;
    try {
      await telegramSetWebhook(token, fullUrl);
      await brain.setConfig('telegram.webhookUrl', fullUrl);
    } catch (err: any) {
      // Token saved even if webhook fails — can retry later
      return {
        ok: true,
        bot: botInfo,
        webhookError: err.message,
      };
    }
  } else {
    // No webhook URL → polling mode. Clear any existing webhook so getUpdates works.
    try {
      await telegramDeleteWebhook(token);
    } catch {
      // Ignore
    }
    await brain.setConfig('telegram.webhookUrl', '');
  }

  brain.events
    .emit('telegram', 'bot.configured', { botUsername: botInfo.username })
    .catch(() => {});

  return {
    ok: true,
    bot: botInfo,
  };
});
