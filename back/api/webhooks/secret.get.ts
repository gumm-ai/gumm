/**
 * GET /api/webhooks/secret
 *
 * Returns the current webhook secret. Auto-generates one if none exists yet.
 * The secret is masked by default; pass ?reveal=1 to get the full value.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const brain = useBrain();
  await brain.ready();

  let secret = await brain.getConfig('webhooks.secret');

  // Auto-generate on first access (consistent with the webhook handler)
  if (!secret) {
    secret = crypto.randomUUID();
    await brain.setConfig('webhooks.secret', secret);
  }

  const reveal = getQuery(event).reveal === '1';

  return {
    secret: reveal
      ? secret
      : secret.slice(0, 8) + '•'.repeat(Math.max(0, secret.length - 8)),
    revealed: reveal,
  };
});
