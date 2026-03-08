/**
 * POST /api/webhooks/secret/regenerate
 *
 * Regenerates the webhook secret. All existing webhook clients must be
 * updated with the new secret after this operation.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const brain = useBrain();
  await brain.ready();

  const newSecret = crypto.randomUUID();
  await brain.setConfig('webhooks.secret', newSecret);

  return { ok: true, secret: newSecret };
});
