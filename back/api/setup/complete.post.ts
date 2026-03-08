/**
 * POST /api/setup/complete
 *
 * Completes the first-launch setup wizard.
 * No auth required — only works ONCE (before setup is marked complete).
 *
 * Accepts:
 *  - password: admin password
 *  - identity: { name, personality, rules, goals }
 *  - openrouterApiKey: (optional, for OpenRouter models like Gemini)
 *  - mistralApiKey: (optional, for Mistral AI models)
 *  - llmModel: model ID (provider auto-detected from model ID)
 *  - telegram: { botToken, webhookUrl, allowedChatIds } (optional)
 */
import { detectProvider } from '../../utils/llm-provider';

export default defineEventHandler(async (event) => {
  const brain = useBrain();
  await brain.ready();

  // Block if setup already completed
  const setupDone = await brain.getConfig('setup.completed');
  if (setupDone === 'true') {
    throw createError({ statusCode: 403, message: 'Setup already completed' });
  }

  const body = await readBody<{
    password?: string;
    language?: string;
    openrouterApiKey?: string;
    mistralApiKey?: string;
    llmModel?: string;
    // Legacy field support
    openrouterModel?: string;
    telegram?: {
      botToken?: string;
      webhookUrl?: string;
      allowedChatIds?: string;
    };
  }>(event);

  // Use password from body OR fallback to env var (from setup-server.sh)
  const password =
    body?.password?.trim() || process.env.GUMM_ADMIN_PASSWORD?.trim();
  if (!password) {
    throw createError({ statusCode: 400, message: 'Password is required' });
  }

  // ── 1. Save identity ─────────────────────────────────────────────
  await brain.setConfig('identity.name', 'Gumm');

  // ── 1b. Save language ────────────────────────────────────────────
  const language = body.language?.trim() || 'en';
  await brain.setConfig('brain.language', language);

  // ── 2. Save admin password hash ──────────────────────────────────
  const hashedPassword = await Bun.password.hash(password, {
    algorithm: 'bcrypt',
    cost: 10,
  });
  await brain.setConfig('admin.passwordHash', hashedPassword);
  await brain.setConfig('admin.passwordSet', 'true');

  // ── 3. LLM provider config ─────────────────────────────────────────
  // Support both new (llmModel) and legacy (openrouterModel) field names
  const selectedModel = body.llmModel?.trim() || body.openrouterModel?.trim();
  if (selectedModel) {
    await brain.setConfig('llm.model', selectedModel);

    const provider = detectProvider(selectedModel);

    if (provider === 'mistral' && body.mistralApiKey?.trim()) {
      await brain.setConfig('mistral.apiKey', body.mistralApiKey.trim());
      await brain.setConfig('mistral.configured', 'true');
    } else if (provider === 'openrouter' && body.openrouterApiKey?.trim()) {
      await brain.setConfig('openrouter.apiKey', body.openrouterApiKey.trim());
      await brain.setConfig('openrouter.configured', 'true');
    }
  } else {
    // No model selected, but if API key provided, save it anyway
    if (body.openrouterApiKey?.trim()) {
      await brain.setConfig('openrouter.apiKey', body.openrouterApiKey.trim());
      await brain.setConfig('openrouter.configured', 'true');
    }
    if (body.mistralApiKey?.trim()) {
      await brain.setConfig('mistral.apiKey', body.mistralApiKey.trim());
      await brain.setConfig('mistral.configured', 'true');
    }
  }

  // ── 4. Telegram bot (optional) ────────────────────────────────────
  if (body.telegram?.botToken?.trim()) {
    const token = body.telegram.botToken.trim();
    try {
      const botInfo = await telegramGetMe(token);
      await brain.setConfig('telegram.botToken', token);
      await brain.setConfig('telegram.botUsername', botInfo.username);
      await brain.setConfig('telegram.botName', botInfo.first_name);
      await brain.setConfig('telegram.enabled', 'true');

      if (body.telegram.allowedChatIds) {
        await brain.setConfig(
          'telegram.allowedChatIds',
          body.telegram.allowedChatIds.trim(),
        );
      }

      if (body.telegram.webhookUrl?.trim()) {
        const fullUrl = `${body.telegram.webhookUrl.trim()}/api/telegram/webhook`;
        try {
          await telegramSetWebhook(token, fullUrl);
          await brain.setConfig('telegram.webhookUrl', fullUrl);
        } catch {
          // Non-blocking — webhook can be set later
        }
      }
    } catch {
      // Invalid token — skip Telegram, don't block setup
    }
  }

  // ── 5. Mark setup as done ─────────────────────────────────────────
  await brain.setConfig('setup.completed', 'true');
  await brain.setConfig('setup.completedAt', new Date().toISOString());

  // Log the user in
  await setUserSession(event, { user: { name: 'Admin' } });

  brain.events
    .emit('brain', 'setup.completed', { name: 'Gumm' })
    .catch(() => {});

  return { ok: true };
});
