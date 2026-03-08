/**
 * POST /api/telegram/disconnect
 *
 * Remove webhook and disable the Telegram bot.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user)
    throw createError({ statusCode: 401, message: 'Unauthorized' });

  const brain = useBrain();
  await brain.ready();

  const token = await brain.getConfig('telegram.botToken');
  if (token) {
    try {
      await telegramDeleteWebhook(token);
    } catch {
      // Ignore — token may be invalid
    }
  }

  await brain.setConfig('telegram.enabled', 'false');

  brain.events.emit('telegram', 'bot.disconnected', {}).catch(() => {});

  return { ok: true };
});
