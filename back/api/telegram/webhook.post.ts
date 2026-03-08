/**
 * POST /api/telegram/webhook
 *
 * Receives incoming Telegram updates and routes messages through the Brain pipeline.
 * No auth required — Telegram calls this directly.
 * Security:
 *   1. HMAC secret_token header validation (when telegram.webhookSecret is set).
 *   2. Chat ID whitelist (inside processTelegramUpdate).
 */
import { timingSafeEqual } from 'node:crypto';
import type { TelegramUpdate } from '../../utils/telegram';
import { processTelegramUpdate } from '../../utils/telegram-handler';

export default defineEventHandler(async (event) => {
  const brain = useBrain();
  await brain.ready();

  // Validate Telegram's X-Telegram-Bot-Api-Secret-Token header
  const webhookSecret = await brain.getConfig('telegram.webhookSecret');
  if (webhookSecret) {
    const providedToken =
      getHeader(event, 'x-telegram-bot-api-secret-token') || '';
    const expected = Buffer.from(webhookSecret, 'utf8');
    const provided = Buffer.from(providedToken, 'utf8');
    const valid =
      expected.length === provided.length &&
      timingSafeEqual(expected, provided);
    if (!valid) {
      throw createError({ statusCode: 401, message: 'Invalid webhook token' });
    }
  }

  const update = await readBody<TelegramUpdate>(event);
  await processTelegramUpdate(update);
  return { ok: true };
});
