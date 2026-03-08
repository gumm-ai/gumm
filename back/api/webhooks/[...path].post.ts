/**
 * POST /api/webhooks/[...path]
 *
 * Generic webhook endpoint for external services (n8n, Zapier, custom automations).
 * This endpoint is bypassed by the VPN guard middleware.
 *
 * Security: always validated with X-Webhook-Secret (auto-generated on first use).
 * The secret is visible in the Brain dashboard under Webhooks settings.
 *
 * Usage examples:
 * - POST /api/webhooks/n8n
 * - POST /api/webhooks/custom/my-automation
 */
import { remember, recall } from '../../utils/memory';
import { timingSafeEqual } from 'node:crypto';

const WEBHOOK_NAMESPACE = '_webhooks';

export default defineEventHandler(async (event) => {
  const brain = useBrain();
  await brain.ready();

  // Get the webhook path (everything after /api/webhooks/)
  const fullPath = event.path || '';
  const webhookPath = fullPath.replace(/^\/api\/webhooks\/?/, '') || 'default';

  // ── Secret validation (always enforced) ───────────────────────────────────
  let configuredSecret = await brain.getConfig('webhooks.secret');

  // Auto-generate a secret on first use so the endpoint is never open
  if (!configuredSecret) {
    configuredSecret = crypto.randomUUID();
    await brain.setConfig('webhooks.secret', configuredSecret);
    console.log(
      `[webhooks] Generated webhook secret. Configure your client with: X-Webhook-Secret: ${configuredSecret}`,
    );
    // Reject this first request — the caller doesn't have the secret yet
    throw createError({
      statusCode: 503,
      message:
        'Webhook secret has been auto-generated. Check the Brain dashboard (Webhooks settings) to retrieve it, then retry.',
    });
  }

  const body = await readBody(event).catch(() => ({}));

  const headerSecret = getHeader(event, 'x-webhook-secret');
  const querySecret = getQuery(event).secret as string | undefined;
  const bodySecret = body?.secret;
  const providedSecret = headerSecret || querySecret || bodySecret;

  if (!providedSecret) {
    throw createError({ statusCode: 401, message: 'Missing webhook secret' });
  }

  // Constant-time comparison to prevent timing attacks
  const expected = Buffer.from(configuredSecret, 'utf8');
  const provided = Buffer.from(String(providedSecret), 'utf8');
  const valid =
    expected.length === provided.length && timingSafeEqual(expected, provided);

  if (!valid) {
    console.warn(
      `[webhooks] Invalid secret for ${webhookPath} from ${getRequestIP(event)}`,
    );
    throw createError({ statusCode: 401, message: 'Invalid webhook secret' });
  }

  // Remove secret from body before processing
  if (body?.secret) {
    delete body.secret;
  }

  // Log the webhook
  console.log(`[webhooks] Received webhook: ${webhookPath}`, {
    method: event.method,
    ip: getRequestIP(event),
    hasBody: Object.keys(body || {}).length > 0,
  });

  // Emit event for modules/tools to handle
  brain.events.emit('webhook', 'received', {
    path: webhookPath,
    body,
    timestamp: Date.now(),
  });

  // Store in memory for retrieval by tools (last 100 webhooks)
  const webhookHistoryRaw = await recall(WEBHOOK_NAMESPACE, 'history');
  const history: any[] = webhookHistoryRaw
    ? JSON.parse(webhookHistoryRaw as string)
    : [];
  history.unshift({
    path: webhookPath,
    body,
    timestamp: Date.now(),
  });
  // Keep only last 100 entries
  if (history.length > 100) {
    history.length = 100;
  }
  await remember(WEBHOOK_NAMESPACE, 'history', JSON.stringify(history));

  return {
    success: true,
    path: webhookPath,
    message: 'Webhook received',
  };
});
